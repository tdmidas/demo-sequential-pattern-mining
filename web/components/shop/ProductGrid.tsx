"use client";

import { Check, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Item } from "@/lib/data";
import type { Recommendation } from "@/lib/mining/rules";
import { useShop } from "../shop-context";
import { CATEGORY_STYLE, Card, PatternView, ProductArt, Spinner, fmt, money, pct, titleCase } from "../ui";

const PAGE = 24;

export function CategoryStrip({ active, onPick }: { active: string | null; onPick: (key: string | null) => void }) {
  const { catalog } = useShop();
  if (!catalog) return null;
  return (
    <Card>
      <h2 className="border-b border-line px-5 py-3 text-[13px] font-semibold uppercase tracking-wide text-ink-2">Danh mục</h2>
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8">
        {catalog.categories.map((c) => {
          const s = CATEGORY_STYLE[c.key] ?? CATEGORY_STYLE.other;
          const Icon = s.icon;
          const on = active === c.key;
          return (
            <button
              key={c.key}
              onClick={() => {
                onPick(on ? null : c.key);
                document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
              }}
              aria-pressed={on}
              className={`-mb-px -mr-px flex flex-col items-center gap-1.5 border-b border-r border-line px-2 py-3.5 text-center transition-colors hover:bg-brand-50 ${
                on ? "bg-brand-50" : ""
              }`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: s.bg, color: s.fg }}>
                <Icon className="h-5 w-5" strokeWidth={1.5} />
              </span>
              <span className={`text-xs leading-tight ${on ? "font-semibold text-brand-700" : "text-ink"}`}>{c.label}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

export function ProductGrid({
  category,
  setCategory,
  onOpen,
}: {
  category: string | null;
  setCategory: (key: string | null) => void;
  onOpen: (item: Item) => void;
}) {
  const { catalog, query, setQuery, addToCart, cart } = useShop();
  const [sort, setSort] = useState<"popular" | "price-asc" | "price-desc">("popular");
  const [shown, setShown] = useState(PAGE);

  const list = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    const out = catalog.items.filter((it) => (!category || it.category === category) && (!q || it.name.toLowerCase().includes(q)));
    if (sort === "price-asc") out.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") out.sort((a, b) => b.price - a.price);
    return out;
  }, [catalog, category, query, sort]);
  useEffect(() => setShown(PAGE), [category, query, sort]);

  if (!catalog) return null;
  const catLabel = catalog.categories.find((c) => c.key === category)?.label;

  return (
    <Card>
      <div id="products" className="scroll-mt-[150px]" />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold">Tất cả sản phẩm</h2>
          <span className="tabular text-[13px] text-ink-3">{fmt(list.length)} kết quả</span>
          {catLabel && <FilterChip label={catLabel} onClear={() => setCategory(null)} />}
          {query.trim() && <FilterChip label={`“${query.trim()}”`} onClear={() => setQuery("")} />}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          Sắp xếp
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded border border-line-strong bg-surface px-2 py-1 text-ink">
            <option value="popular">Phổ biến nhất</option>
            <option value="price-asc">Giá tăng dần</option>
            <option value="price-desc">Giá giảm dần</option>
          </select>
        </label>
      </header>
      {list.length === 0 ? (
        <p className="px-5 py-14 text-center text-sm text-ink-3">Không có sản phẩm nào khớp. Thử từ khoá tiếng Anh như “mug”, “bag”, “cake”.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {list.slice(0, shown).map((it) => {
            const inCart = cart.includes(it.id);
            return (
              <article key={it.id} className="flex flex-col overflow-hidden rounded-md border border-line bg-surface transition-shadow hover:shadow-md">
                <button onClick={() => onOpen(it)} className="block text-left" aria-label={`Xem ${it.name}`}>
                  <ProductArt item={it} />
                </button>
                <div className="flex flex-1 flex-col p-2.5">
                  <h3 className="line-clamp-2 min-h-[36px] text-[12.5px] font-medium leading-snug">{titleCase(it.name)}</h3>
                  <div className="mt-1.5 flex items-end justify-between gap-2">
                    <div>
                      <div className="tabular text-[15px] font-semibold text-accent">{money(it.price)}</div>
                      <div className="tabular text-[11px] text-ink-3">{fmt(it.buyers)} khách đã mua</div>
                    </div>
                    <button
                      onClick={() => addToCart(it.id)}
                      disabled={inCart}
                      aria-label={inCart ? "Đã có trong giỏ" : `Thêm ${it.name} vào giỏ`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:bg-line-strong"
                    >
                      {inCart ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {shown < list.length && (
        <div className="border-t border-line p-3 text-center">
          <button onClick={() => setShown((s) => s + PAGE)} className="rounded-md border border-line-strong px-5 py-2 text-[13px] font-medium hover:border-brand-500 hover:text-brand-700">
            Xem thêm {Math.min(PAGE, list.length - shown)} sản phẩm
          </button>
        </div>
      )}
    </Card>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand-800">
      {label}
      <button onClick={onClear} aria-label={`Bỏ lọc ${label}`} className="rounded-full p-0.5 hover:bg-brand-100">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/** Chi tiết sản phẩm + "khách mua món này thường mua tiếp" (các luật có vế trái chỉ gồm món này). */
export function ProductModal({ item, onClose, onOpen }: { item: Item; onClose: () => void; onOpen: (item: Item) => void }) {
  const { catalog, addToCart, cart, settings, analysis } = useShop();
  const [next, setNext] = useState<Recommendation[] | null>(null);

  useEffect(() => {
    setNext(null);
    const ctrl = new AbortController();
    fetch("/api/recommend", {
      method: "POST",
      signal: ctrl.signal,
      body: JSON.stringify({
        history: [[item.id]],
        method: "sequential",
        algorithm: settings.algorithm,
        minsupPct: settings.minsupPct,
        maxLength: settings.maxLength,
        minConfidence: 0.05,
        excludeBought: true,
        k: 6,
      }),
    })
      .then((r) => r.json())
      .then((d) => setNext((d.recommendations as Recommendation[]).filter((r) => !r.fallback)))
      .catch(() => {});
    return () => ctrl.abort();
  }, [item.id, settings.algorithm, settings.minsupPct, settings.maxLength]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!catalog) return null;
  const inCart = cart.includes(item.id);
  const cat = catalog.categories.find((c) => c.key === item.category);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={item.name}>
      <div className="absolute inset-0 bg-ink/45" onClick={onClose} />
      <div className="fade-up thin-scroll relative max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-lg bg-surface shadow-xl">
        <button onClick={onClose} aria-label="Đóng" className="absolute right-3 top-3 z-10 rounded-full bg-surface/90 p-1.5 text-ink-2 hover:text-ink">
          <X className="h-5 w-5" />
        </button>
        <div className="grid gap-5 p-5 sm:grid-cols-[240px_1fr]">
          <ProductArt item={item} className="!aspect-square rounded-md" />
          <div>
            <div className="text-xs text-ink-3">
              {cat?.label} · Mã {item.code}
            </div>
            <h2 className="mt-1 pr-8 text-lg font-semibold leading-snug">{titleCase(item.name)}</h2>
            <div className="tabular mt-2 text-2xl font-semibold text-accent">{money(item.price)}</div>
<p className="tabular mt-1 text-[13px] text-ink-2">{fmt(item.buyers)} khách đã mua</p>
            {analysis && (
              <p className="tabular mt-2 text-xs text-ink-3">
                Support trong CSDL chuỗi: {fmt(item.support)} ({pct(item.support / catalog.sequences)})
              </p>
            )}
            <button
              onClick={() => addToCart(item.id)}
              disabled={inCart}
              className="mt-4 h-10 rounded-md bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-line-strong"
            >
              {inCart ? "Đã có trong giỏ" : "Thêm vào giỏ"}
            </button>
          </div>
        </div>
        <div className="border-t border-line px-5 py-4">
          <h3 className="text-[13px] font-semibold">Khách mua sản phẩm này thường mua tiếp</h3>
          {!next ? (
            <div className="flex items-center gap-2 py-5 text-[13px] text-ink-2">
              <Spinner /> Đang tra luật…
            </div>
          ) : next.length === 0 ? (
<p className="py-4 text-[13px] text-ink-3">
              {analysis
                ? `Không có luật tuần tự nào bắt đầu từ sản phẩm này ở minsup ${settings.minsupPct}%. Đây là hạn chế với sản phẩm ít người mua: mẫu chứa nó không đạt ngưỡng support.`
                : "Chưa có đủ dữ liệu mua hàng để gợi ý cho sản phẩm này."}
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {next.map((r) => {
                const it = catalog.items[r.item];
                const w = r.why;
                return (
                  <li key={r.item} className="flex items-center gap-3 py-2.5">
                    <button onClick={() => onOpen(it)} className="shrink-0" aria-label={`Xem ${it.name}`}>
                      <ProductArt item={it} className="!aspect-square !w-11 rounded" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{titleCase(it.name)}</div>
                      {!analysis && <div className="tabular text-[13px] font-semibold text-accent">{money(it.price)}</div>}
                      {analysis && w.type === "sequential" && (
                        <div className="mt-0.5">
                          <PatternView pattern={w.antecedent} items={catalog.items} then={r.item} max={22} />
                        </div>
                      )}
                    </div>
                    {w.type === "sequential" && (
                      <div className="tabular shrink-0 text-right text-xs text-ink-2">
                        <div className="text-sm font-semibold text-ink">{pct(w.confidence, 0)}</div>
                        {analysis ? `lift ${w.lift.toFixed(1).replace(".", ",")}` : "khách mua tiếp"}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
