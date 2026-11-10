"use client";

import { CircleCheck, Search, ShoppingBasket, ShoppingCart, Trash2, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useShop } from "./shop-context";
import { ProductArt, money, titleCase } from "./ui";

const NAV = [
  { href: "/", label: "Cửa hàng", hint: "Ứng dụng gợi ý" },
  { href: "/lab", label: "Khai thác mẫu", hint: "Chạy GSP / SPADE / PrefixSpan" },
  { href: "/steps", label: "Minh hoạ", hint: "Từ đơn hàng đến gợi ý, từng bước" },
  { href: "/compare", label: "So sánh & hạn chế", hint: "Thực nghiệm" },
  { href: "/data", label: "Dữ liệu", hint: "Pipeline tiền xử lý" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { cart, setCartOpen, query, setQuery, catalog, persona, selectPersona, analysis, setAnalysis, toast } = useShop();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 bg-brand-600 text-white shadow-[0_1px_0_rgba(0,0,0,0.08)]">
        <div className="bg-brand-700/70">
          <div className="mx-auto flex h-7 max-w-[1240px] items-center justify-between px-4 text-[11.5px] text-white/85">
            <span>Demo môn Khai thác dữ liệu và ứng dụng · Khai thác mẫu tuần tự</span>
            <label className="flex cursor-pointer select-none items-center gap-2" title="Hiện luật, độ đo và công tắc phương pháp ngay trong cửa hàng">
              <span>Góc nhìn kỹ thuật</span>
              <input type="checkbox" role="switch" checked={analysis} onChange={(e) => setAnalysis(e.target.checked)} className="peer sr-only" />
              <span className="relative h-4 w-7 rounded-full bg-white/30 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-[#7fe0b6] peer-checked:after:translate-x-3 peer-focus-visible:ring-2 peer-focus-visible:ring-white" />
            </label>
          </div>
        </div>
        <div className="mx-auto flex h-[60px] max-w-[1240px] items-center gap-6 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="NextBasket - trang chủ">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-brand-600">
              <ShoppingBasket className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="text-[19px] font-bold tracking-tight">NextBasket</span>
          </Link>
          <form
            className="relative flex-1"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (pathname !== "/") router.push("/");
              setTimeout(() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }), 80);
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm sản phẩm: mug, lunch bag, christmas…"
              aria-label="Tìm sản phẩm"
              className="h-10 w-full rounded-md border-0 bg-white pl-3.5 pr-12 text-sm text-ink placeholder:text-ink-3 focus:outline-2 focus:outline-white/70"
            />
            <button
              type="submit"
              aria-label="Tìm"
              className="absolute right-1 top-1 flex h-8 w-10 items-center justify-center rounded bg-brand-600 text-white hover:bg-brand-700"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>
          {catalog && (
            <label className="relative hidden h-10 shrink-0 items-center gap-2 rounded-md pl-2.5 text-sm font-medium hover:bg-white/10 md:flex">
              <UserRound className="h-5 w-5" />
              <span className="sr-only">Tài khoản</span>
              <select
                value={persona?.id ?? "new"}
                onChange={(e) => selectPersona(e.target.value === "new" ? null : Number(e.target.value))}
                className="h-10 max-w-[190px] cursor-pointer appearance-none bg-transparent pr-3 text-sm font-medium text-white outline-none [&>option]:text-ink"
              >
                {catalog.personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    Khách #{p.id} ({p.history.length} đơn)
                  </option>
                ))}
                <option value="new">Khách mới</option>
              </select>
            </label>
          )}
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-white/10"
            aria-label={`Giỏ hàng, ${cart.length} sản phẩm`}
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="hidden md:inline">Giỏ hàng</span>
            {cart.length > 0 && (
              <span className="tabular absolute -top-0.5 left-6 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white ring-2 ring-brand-600">
                {cart.length}
              </span>
            )}
          </button>
        </div>
        <nav className="border-t border-white/10 bg-white text-ink" aria-label="Điều hướng chính">
          <div className="thin-scroll mx-auto flex max-w-[1240px] gap-1 overflow-x-auto px-3">
            {NAV.map((n) => {
              const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  title={n.hint}
                  className={`relative shrink-0 px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                    active ? "text-brand-700" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {n.label}
                  {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-600" />}
                </Link>
              );
            })}
          </div>
          <div className="h-px bg-line" />
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-5">{children}</main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-ink-3">
          <span>NextBasket là cửa hàng mô phỏng phục vụ học tập. Sản phẩm và giao dịch lấy từ bộ dữ liệu Online Retail II (UCI ML Repository).</span>
          <span>GSP · SPADE · PrefixSpan tự cài đặt bằng TypeScript</span>
        </div>
      </footer>

      <CartDrawer />
      {toast && (
        <div role="status" className="fade-up fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md bg-ink px-4 py-3 text-sm text-white shadow-lg">
          <CircleCheck className="h-4 w-4 text-[#7fe0b6]" /> {toast}
        </div>
      )}
    </div>
  );
}

function CartDrawer() {
  const { cartOpen, setCartOpen, cart, removeFromCart, checkout, catalog } = useShop();
  if (!cartOpen || !catalog) return null;
  const items = cart.map((id) => catalog.items[id]);
  const total = items.reduce((s, it) => s + it.price, 0);
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Giỏ hàng">
      <div className="absolute inset-0 bg-ink/40" onClick={() => setCartOpen(false)} />
      <aside className="slide-in absolute right-0 top-0 flex h-full w-full max-w-[400px] flex-col bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">Giỏ hàng ({cart.length})</h2>
          <button onClick={() => setCartOpen(false)} aria-label="Đóng" className="rounded p-1 text-ink-2 hover:bg-page">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="thin-scroll flex-1 overflow-y-auto px-5">
          {items.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink-3">
              Giỏ hàng của bạn đang trống.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-3">
                  <ProductArt item={it} className="!aspect-square !w-14 shrink-0 rounded" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{titleCase(it.name)}</div>
                    <div className="tabular text-[13px] font-semibold text-accent">{money(it.price)}</div>
                  </div>
                  <button
                    onClick={() => removeFromCart(it.id)}
                    aria-label={`Bỏ ${it.name} khỏi giỏ`}
                    className="rounded p-1.5 text-ink-3 hover:bg-page hover:text-bad"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-line px-5 py-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-ink-2">Tổng cộng</span>
            <span className="tabular text-lg font-semibold text-accent">{money(total)}</span>
          </div>
          <button
            disabled={items.length === 0}
            onClick={checkout}
            className="h-11 w-full rounded-md bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-line-strong"
          >
            Đặt hàng
          </button>
          <p className="mt-2 text-xs leading-relaxed text-ink-3">
            Sau khi đặt, đơn hàng xuất hiện trong lịch sử mua và các gợi ý sẽ được cập nhật theo.
          </p>
        </div>
      </aside>
    </div>
  );
}
