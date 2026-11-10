"""
Tải ảnh minh hoạ cho sản phẩm bằng cách tìm tên sản phẩm trên Bing Images và lấy ảnh thu nhỏ đầu tiên.

Chạy:
    .venv/Scripts/python.exe -I pipeline/fetch_images.py            # chỉ tải các ảnh còn thiếu
    .venv/Scripts/python.exe -I pipeline/fetch_images.py --force    # tải lại toàn bộ

Kết quả: web/public/products/<StockCode>.jpg  và  web/data/images.json (nguồn của từng ảnh).

Lưu ý: bộ dữ liệu gốc không kèm ảnh. Ảnh lấy từ kết quả tìm kiếm nên có thể không khớp tuyệt đối với
sản phẩm và thuộc bản quyền của trang gốc; chỉ dùng cho mục đích minh hoạ trong lớp học.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ITEMS = ROOT / "web" / "data" / "items.json"
OUT_DIR = ROOT / "web" / "public" / "products"
META = ROOT / "web" / "data" / "images.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def get(url: str, timeout: int = 20) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def search(name: str) -> list[dict]:
    """Trả về danh sách kết quả {turl: ảnh thu nhỏ, murl: ảnh gốc, purl: trang chứa ảnh}."""
    q = urllib.parse.quote_plus(name.lower())
    page = get(f"https://www.bing.com/images/async?q={q}&first=0&count=20&mmasync=1&mkt=en-GB").decode("utf-8", "ignore")
    out = []
    # Mỗi kết quả là một thẻ có thuộc tính m="{...}" (JSON đã escape HTML) chứa purl, murl, turl
    for raw in re.findall(r'm="(\{&quot;.*?\})"', page):
        try:
            m = json.loads(html.unescape(raw))
        except json.JSONDecodeError:
            continue
        if m.get("turl"):
            out.append({"turl": m["turl"], "murl": m.get("murl", ""), "purl": m.get("purl", ""), "title": m.get("t", "") + " " + m.get("desc", "")})
    return out


def rank(name: str, results: list[dict]) -> list[dict]:
    """Ưu tiên kết quả có tiêu đề chứa nhiều từ của tên sản phẩm nhất (giữ thứ tự gốc khi hoà)."""
    words = {w for w in re.findall(r"[a-z]+", name.lower()) if len(w) > 2}

    def score(r: dict) -> int:
        title = set(re.findall(r"[a-z]+", r["title"].lower()))
        return len(words & title)

    return sorted(results[:10], key=score, reverse=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="chỉ xử lý N sản phẩm đầu (để thử)")
    ap.add_argument("--delay", type=float, default=0.3, help="nghỉ giữa các truy vấn (giây)")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    items = json.loads(ITEMS.read_text(encoding="utf-8"))["items"]
    meta: dict[str, dict] = json.loads(META.read_text(encoding="utf-8")) if META.exists() else {}
    if args.limit:
        items = items[: args.limit]

    ok = fail = skip = 0
    for n, it in enumerate(items, 1):
        code, name = it["code"], it["name"]
        target = OUT_DIR / f"{code}.jpg"
        if target.exists() and not args.force:
            skip += 1
            continue
        try:
            results = rank(name, search(name))
            saved = False
            for r in results[:4]:
                # w/h/c=7: Bing cắt ảnh về khung 4:3, đủ nét cho thẻ sản phẩm
                data = get(r["turl"] + "&w=480&h=360&c=7&rs=1&p=0")
                if len(data) > 3000 and data[:2] == b"\xff\xd8":
                    target.write_bytes(data)
                    meta[code] = {"name": name, "source": r["murl"], "page": r["purl"]}
                    saved = True
                    break
            if saved:
                ok += 1
            else:
                fail += 1
                print(f"  không có ảnh: {code} {name}")
        except Exception as e:  # mạng lỗi thì bỏ qua, lần chạy sau sẽ thử lại
            fail += 1
            print(f"  lỗi {code} {name}: {e}")
        if n % 25 == 0:
            print(f"{n}/{len(items)}  ok={ok} fail={fail} skip={skip}", flush=True)
            META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        time.sleep(args.delay)

    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Xong: tải {ok}, lỗi {fail}, đã có sẵn {skip}. Ảnh nằm ở {OUT_DIR}")


if __name__ == "__main__":
    main()
