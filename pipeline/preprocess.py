"""
Pipeline tiền xử lý: Online Retail II (UCI)  ->  CSDL chuỗi (sequence database)

Chạy:
    .venv/Scripts/python.exe -I pipeline/preprocess.py
    (tuỳ chọn)  --top-items 300 --min-baskets 2 --max-baskets 20 --out web/data

Đầu vào : data/raw/online_retail_II.xlsx  (2 sheet: 2009-2010, 2010-2011)
Đầu ra  : web/data/items.json         danh mục sản phẩm (id, mã, tên, giá, nhóm, độ phổ biến)
          web/data/customers.json     mỗi khách = 1 chuỗi các giỏ hàng theo thời gian
          web/data/sequences.spmf.txt cùng dữ liệu ở định dạng SPMF (phần train)
          web/data/pipeline.json      số liệu từng bước (funnel) + thống kê mô tả

Mỗi bước ghi lại số dòng / hoá đơn / khách / sản phẩm còn lại để web vẽ funnel.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_XLSX = ROOT / "data" / "raw" / "online_retail_II.xlsx"
CACHE = ROOT / "data" / "raw" / "_raw_cache.pkl"

# Nhóm sản phẩm suy ra từ từ khoá trong tên (dataset gốc không có cột category).
# Thứ tự quan trọng: luật đứng trước được ưu tiên.
CATEGORY_RULES: list[tuple[str, str, list[str]]] = [
    ("christmas", "Giáng sinh", ["CHRISTMAS", "XMAS", "REINDEER", "SNOW", "ADVENT", "SANTA", "BAUBLE", "WREATH", "STOCKING"]),
    ("bags", "Túi & Ví", ["BAG", "SHOPPER", "PURSE", "WALLET", "LUGGAGE", "BACKPACK", "RUCKSACK"]),
    ("lunch", "Hộp cơm & Bình nước", ["LUNCH BOX", "LUNCHBOX", "SNACK BOX", "WATER BOTTLE", "HOT WATER BOTTLE", "FLASK", "BOTTLE"]),
    ("baking", "Làm bánh", ["CAKE", "BAKING", "CUPCAKE", "PANTRY", "JELLY MOULD", "COOKIE CUTTER", "PIE ", "OVEN", "APRON", "RECIPE", "JAM ", "ROLLING PIN"]),
    ("tea", "Trà & Cà phê", ["MUG", "TEA", "COFFEE", "CUP", "SAUCER", "TEAPOT", "TEASPOON"]),
    ("kitchen", "Bếp & Bàn ăn", ["PLATE", "BOWL", "NAPKIN", "TRAY", "JUG", "GLASS", "JAR", "TIN", "SPOON", "FORK", "CUTLERY", "KITCHEN", "DISH", "COASTER", "PLACEMAT", "EGG", "BREAD", "MILK", "SUGAR", "BISCUIT", "CHOPPING", "SCALES", "COLANDER", "STRAWS"]),
    ("lighting", "Nến & Đèn", ["CANDLE", "T-LIGHT", "TLIGHT", "LANTERN", "LIGHT", "LAMP", "INCENSE", "NIGHTLIGHT"]),
    ("party", "Tiệc & Trang trí", ["PARTY", "BUNTING", "BALLOON", "GARLAND", "CONFETTI", "PAPER CHAIN", "RIBBON", "BIRTHDAY", "DECORATION", "STREAMER", "FLAG"]),
    ("stationery", "Văn phòng phẩm", ["CARD", "WRAP", "NOTEBOOK", "PENCIL", "PEN ", "PENS", "STICKER", "TAPE", "PAPER", "ERASER", "RULER", "JOURNAL", "BOOK", "CALENDAR", "ORGANISER", "STAMP", "CHALK", "TAG", "ENVELOPE", "POSTCARD", "LETTER"]),
    ("toys", "Đồ chơi & Trẻ em", ["TOY", "DOLL", "GAME", "PUZZLE", "CHILD", "KIDS", "BABY", "SPACEBOY", "DOLLY", "CIRCUS", "SKIPPING", "PLAYHOUSE", "SOLDIER", "DOMINO", "JIGSAW", "TEDDY", "BLOCK", "CRAYON", "PAINT", "SPINNING", "RABBIT", "BUNNY", "DINOSAUR", "HARMONICA", "SEWING KIT", "KNITTING"]),
    ("garden", "Vườn & Ngoài trời", ["GARDEN", "PLANT", "FLOWER POT", "WATERING", "BIRD", "GNOME", "PICNIC", "PARASOL", "HERB", "SEED", "KNEELING", "GROW", "FEEDER", "UMBRELLA"]),
    ("storage", "Hộp & Lưu trữ", ["BOX", "STORAGE", "BASKET", "DRAWER", "CABINET", "HANGER", "HOOK", "RACK", "CRATE", "CASE", "HOLDER", "SHELF", "KEY"]),
    ("jewellery", "Phụ kiện thời trang", ["NECKLACE", "BRACELET", "EARRING", "RING ", "BROOCH", "JEWEL", "HAIR", "SCARF", "GLOVES", "HAT ", "BEAD", "CHARM"]),
    ("decor", "Trang trí nhà", ["HEART", "FRAME", "CLOCK", "SIGN", "DOORMAT", "CUSHION", "MIRROR", "HANGING", "WALL", "ORNAMENT", "VINTAGE", "METAL", "WOOD", "CHALKBOARD", "DOOR", "QUILT", "THROW", "WICKER", "MAT", "MAGNET", "ZINC", "ANTIQUE", "FRENCH", "HOME", "LOVE"]),
]
DEFAULT_CATEGORY = ("other", "Khác")


def categorize(name: str) -> str:
    padded = f" {name} "
    if "HOT WATER BOTTLE" in padded or "HAND WARMER" in padded:
        return "decor"
    for key, _label, words in CATEGORY_RULES:
        if any(w in padded for w in words):
            return key
    return DEFAULT_CATEGORY[0]


def snapshot(df: pd.DataFrame, key: str, label: str, note: str) -> dict:
    return {
        "key": key,
        "label": label,
        "note": note,
        "rows": int(len(df)),
        "invoices": int(df["Invoice"].nunique()),
        "customers": int(df["Customer ID"].nunique()),
        "items": int(df["StockCode"].nunique()),
    }


def load_raw() -> pd.DataFrame:
    """Bước 1 - đọc 2 sheet xlsx và gộp lại (cache pickle để lần sau chạy nhanh)."""
    if CACHE.exists() and CACHE.stat().st_mtime >= RAW_XLSX.stat().st_mtime:
        return pd.read_pickle(CACHE)
    sheets = pd.read_excel(RAW_XLSX, sheet_name=None, dtype={"Invoice": str, "StockCode": str})
    df = pd.concat(sheets.values(), ignore_index=True)
    df.to_pickle(CACHE)
    return df


def histogram(values: pd.Series, bins: list[int]) -> list[dict]:
    """Đếm theo các khoảng [bins[i], bins[i+1]) ; khoảng cuối là 'từ bins[-1] trở lên'."""
    out = []
    for i, lo in enumerate(bins):
        hi = bins[i + 1] if i + 1 < len(bins) else None
        if hi is None:
            n, label = int((values >= lo).sum()), f"{lo}+"
        else:
            n = int(((values >= lo) & (values < hi)).sum())
            label = str(lo) if hi - lo == 1 else f"{lo}-{hi - 1}"
        out.append({"label": label, "count": n})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top-items", type=int, default=300, help="giữ N sản phẩm có nhiều khách mua nhất")
    ap.add_argument("--min-baskets", type=int, default=2, help="khách phải có ít nhất N giỏ hàng")
    ap.add_argument("--max-baskets", type=int, default=20, help="chỉ giữ N giỏ gần nhất của mỗi khách")
    ap.add_argument("--out", type=Path, default=ROOT / "web" / "data")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    steps: list[dict] = []

    # 1. Load -----------------------------------------------------------------
    df = load_raw()
    df["StockCode"] = df["StockCode"].astype(str).str.strip().str.upper()
    df["Invoice"] = df["Invoice"].astype(str).str.strip()
    steps.append(snapshot(df, "load", "Dữ liệu gốc", "Gộp 2 sheet 2009-2010 và 2010-2011"))

    # 2. Bỏ dòng thiếu Customer ID --------------------------------------------
    df = df[df["Customer ID"].notna()].copy()
    df["Customer ID"] = df["Customer ID"].astype(int)
    steps.append(snapshot(df, "customer", "Có mã khách hàng", "Bỏ dòng thiếu Customer ID: không biết ai mua thì không tạo được chuỗi"))

    # 3. Bỏ giao dịch lỗi ------------------------------------------------------
    df = df[~df["Invoice"].str.startswith("C") & (df["Quantity"] > 0) & (df["Price"] > 0)]
    steps.append(snapshot(df, "valid", "Giao dịch hợp lệ", "Bỏ hoá đơn huỷ (Invoice bắt đầu bằng C), Quantity <= 0, Price <= 0"))

    # 4. Bỏ mã không phải sản phẩm --------------------------------------------
    # Mã sản phẩm thật có dạng 5 chữ số + hậu tố chữ (85123A). POST, D, M, DOT,
    # BANK CHARGES, ADJUST, TEST... là phí vận chuyển / điều chỉnh thủ công.
    df = df[df["StockCode"].str.match(r"^\d{5}[A-Z]*$")]
    steps.append(snapshot(df, "product", "Chỉ sản phẩm thật", "Bỏ mã phí/điều chỉnh: POST, D, M, DOT, BANK CHARGES, ADJUST, TEST..."))

    # 5. Chuẩn hoá tên ---------------------------------------------------------
    df["Description"] = df["Description"].astype(str).str.strip().str.upper().str.replace(r"\s+", " ", regex=True)
    name_of = df.groupby("StockCode")["Description"].agg(lambda s: s.value_counts().index[0])
    price_of = df.groupby("StockCode")["Price"].median()
    df = df.drop_duplicates()
    steps.append(snapshot(df, "normalize", "Chuẩn hoá & khử trùng lặp", "Mỗi StockCode giữ 1 tên phổ biến nhất, giá = trung vị; bỏ dòng trùng hoàn toàn"))

    # 6. Lọc sản phẩm phổ biến -------------------------------------------------
    popularity = df.groupby("StockCode")["Customer ID"].nunique().sort_values(ascending=False)
    keep = popularity.head(args.top_items).index
    df = df[df["StockCode"].isin(keep)]
    steps.append(snapshot(df, "top_items", f"Top {args.top_items} sản phẩm", "Giữ các sản phẩm có nhiều khách mua nhất để giảm độ thưa của dữ liệu"))

    # 7. Tạo chuỗi: khách -> các giỏ hàng theo ngày ----------------------------
    item_id = {code: i for i, code in enumerate(keep)}
    df["item"] = df["StockCode"].map(item_id)
    df["day"] = pd.to_datetime(df["InvoiceDate"]).dt.strftime("%Y-%m-%d")
    country_of = df.groupby("Customer ID")["Country"].agg(lambda s: s.value_counts().index[0])
    baskets = (
        df.groupby(["Customer ID", "day"])["item"].agg(lambda s: sorted(set(int(x) for x in s))).reset_index()
    ).sort_values(["Customer ID", "day"])
    n_baskets_all = len(baskets)
    n_customers_all = baskets["Customer ID"].nunique()

    # 8. Lọc chuỗi -------------------------------------------------------------
    customers = []
    for cid, grp in baskets.groupby("Customer ID", sort=True):
        seq = [{"date": d, "items": it} for d, it in zip(grp["day"], grp["item"])]
        if len(seq) < args.min_baskets:
            continue
        seq = seq[-args.max_baskets:]
        customers.append({"id": int(cid), "country": str(country_of[cid]), "baskets": seq})

    kept_ids = {c["id"] for c in customers}
    df_seq = df[df["Customer ID"].isin(kept_ids)]
    s = snapshot(df_seq, "sequences", "Chuỗi mua hàng", "")
    s["note"] = (
        f"Gộp hoá đơn cùng ngày thành 1 giỏ ({n_baskets_all:,} giỏ / {n_customers_all:,} khách); "
        f"giữ khách có >= {args.min_baskets} giỏ, tối đa {args.max_baskets} giỏ gần nhất"
    )
    steps.append(s)

    # 9. Train / test ----------------------------------------------------------
    # Giỏ cuối cùng của mỗi khách là "đáp án" (test); các giỏ trước dùng để khai thác.
    n_seq = len(customers)
    train_lens = [len(c["baskets"]) - 1 for c in customers]
    basket_sizes = [len(b["items"]) for c in customers for b in c["baskets"][:-1]]

    # 10. Xuất file ------------------------------------------------------------
    cat_label = {k: lbl for k, lbl, _ in CATEGORY_RULES} | {DEFAULT_CATEGORY[0]: DEFAULT_CATEGORY[1]}
    seq_support = [0] * len(keep)
    for c in customers:
        for i in {i for b in c["baskets"][:-1] for i in b["items"]}:
            seq_support[i] += 1
    items = [
        {
            "id": i,
            "code": code,
            "name": str(name_of[code]),
            "price": round(float(price_of[code]), 2),
            "category": categorize(str(name_of[code])),
            "buyers": int(popularity[code]),
            "support": seq_support[i],
        }
        for code, i in item_id.items()
    ]
    cat_counts: dict[str, int] = {}
    for it in items:
        cat_counts[it["category"]] = cat_counts.get(it["category"], 0) + 1
    categories = [
        {"key": k, "label": cat_label[k], "count": n}
        for k, n in sorted(cat_counts.items(), key=lambda kv: -kv[1])
    ]

    (args.out / "items.json").write_text(json.dumps({"items": items, "categories": categories}, ensure_ascii=False), encoding="utf-8")
    (args.out / "customers.json").write_text(json.dumps(customers, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # Định dạng SPMF: item cách nhau bởi dấu cách, -1 kết thúc itemset, -2 kết thúc chuỗi
    with (args.out / "sequences.spmf.txt").open("w", encoding="utf-8") as f:
        for c in customers:
            parts = [" ".join(map(str, b["items"])) + " -1" for b in c["baskets"][:-1]]
            f.write(" ".join(parts) + " -2\n")

    ser_len, ser_size = pd.Series(train_lens), pd.Series(basket_sizes)
    stats = {
        "sequences": n_seq,
        "items": len(items),
        "trainBaskets": int(ser_len.sum()),
        "avgSeqLen": round(float(ser_len.mean()), 2),
        "medianSeqLen": float(ser_len.median()),
        "maxSeqLen": int(ser_len.max()),
        "avgBasketSize": round(float(ser_size.mean()), 2),
        "medianBasketSize": float(ser_size.median()),
        "maxBasketSize": int(ser_size.max()),
        "density": round(float(ser_size.mean()) / len(items), 4),
        "dateMin": str(df_seq["day"].min()),
        "dateMax": str(df_seq["day"].max()),
        "countries": int(df_seq["Country"].nunique()),
    }
    sample = customers[len(customers) // 3]
    pipeline = {
        "source": "Online Retail II - UCI Machine Learning Repository (https://archive.ics.uci.edu/dataset/502/online+retail+ii)",
        "params": {"topItems": args.top_items, "minBaskets": args.min_baskets, "maxBaskets": args.max_baskets},
        "steps": steps,
        "stats": stats,
        "seqLenHist": histogram(ser_len, [1, 2, 3, 4, 5, 6, 8, 11, 16]),
        "basketSizeHist": histogram(ser_size, [1, 2, 3, 5, 8, 11, 16, 26, 51]),
        "sample": {
            "customer": sample["id"],
            "baskets": sample["baskets"][:4],
            "spmf": " ".join(" ".join(map(str, b["items"])) + " -1" for b in sample["baskets"][:4]) + " -2",
        },
    }
    (args.out / "pipeline.json").write_text(json.dumps(pipeline, ensure_ascii=False, indent=1), encoding="utf-8")

    for st in steps:
        print(f"{st['label']:<28} rows={st['rows']:>9,} invoices={st['invoices']:>7,} customers={st['customers']:>6,} items={st['items']:>6,}")
    print(json.dumps(stats, ensure_ascii=False))
    print("categories:", {c["label"]: c["count"] for c in categories})
    print("other:", [it["name"] for it in items if it["category"] == "other"])


if __name__ == "__main__":
    main()
