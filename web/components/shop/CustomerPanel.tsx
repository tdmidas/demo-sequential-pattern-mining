"use client";

import { Eye, EyeOff, PackageOpen, RotateCcw } from "lucide-react";
import { useShop } from "../shop-context";
import { Card, fmtDate, shortName } from "../ui";

/** Cột bên: lịch sử đơn hàng của tài khoản đang đăng nhập. */
export function CustomerPanel({ revealHeldOut, setRevealHeldOut }: { revealHeldOut: boolean; setRevealHeldOut: (v: boolean) => void }) {
  const { catalog, persona, history, newOrders, resetHistory, analysis } = useShop();
  if (!catalog) return null;
  const items = catalog.items;
  const baseLen = persona?.history.length ?? 0;
  // đơn mới nhất hiển thị trên cùng, như trang "Đơn hàng của tôi"
  const orders = history.map((b, i) => ({ ...b, n: i + 1, isNew: i >= baseLen })).reverse();

  return (
    <Card className="lg:sticky lg:top-[150px]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
        <div>
          <h2 className="text-sm font-semibold">Đơn hàng của tôi</h2>
          <p className="tabular mt-0.5 text-xs text-ink-2">{persona ? `Khách #${persona.id} · ${persona.country}` : "Khách mới"}</p>
        </div>
        {newOrders > 0 && (
          <button onClick={resetHistory} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline" title="Xoá các đơn vừa đặt trong phiên demo">
            <RotateCcw className="h-3 w-3" /> Hoàn tác
          </button>
        )}
      </div>

      <div className="px-4 py-3.5">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md bg-page px-3 py-7 text-center text-[12.5px] text-ink-3">
            <PackageOpen className="h-7 w-7" strokeWidth={1.25} />
            Bạn chưa có đơn hàng nào.
          </div>
        ) : (
          <ol className="thin-scroll max-h-[52vh] overflow-y-auto pr-1">
            {orders.map((b, i) => (
              <li key={b.n} className="relative pb-3.5 pl-5 last:pb-0">
                <span className={`absolute left-0 top-1.5 h-2 w-2 rounded-full ${b.isNew ? "bg-accent" : "bg-brand-500"}`} />
                {i < orders.length - 1 && <span className="absolute left-[3.5px] top-4 h-full w-px bg-line-strong" />}
                <div className="tabular flex items-center gap-2 text-xs text-ink-2">
                  <span className="font-medium text-ink">Đơn {b.n}</span>
                  <span>{fmtDate(b.date)}</span>
                  {b.isNew && <span className="rounded bg-accent-soft px-1 text-[10.5px] font-semibold text-accent">Mới đặt</span>}
                </div>
                <ul className="mt-1 space-y-0.5 text-[12px] text-ink-2">
                  {b.items.slice(0, 4).map((id) => (
                    <li key={id} title={items[id].name} className="truncate">
                      {shortName(items[id], 34)}
                    </li>
                  ))}
                  {b.items.length > 4 && <li className="text-ink-3">và {b.items.length - 4} sản phẩm khác</li>}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>

      {analysis && persona && (
        <div className="border-t border-line bg-page/50 px-4 py-3.5">
          <button
            onClick={() => setRevealHeldOut(!revealHeldOut)}
            disabled={newOrders > 0}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface py-2 text-[12.5px] font-medium text-ink hover:border-brand-500 hover:text-brand-700 disabled:text-ink-3 disabled:hover:border-line-strong"
          >
            {revealHeldOut ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {revealHeldOut ? "Ẩn đơn thật kế tiếp" : "Hiện đơn thật kế tiếp"}
          </button>
          {revealHeldOut && newOrders === 0 ? (
            <div className="fade-up mt-2.5">
              <div className="tabular text-xs text-ink-2">Đơn bị giấu khi khai thác · {fmtDate(persona.heldOut.date)}</div>
              <ul className="mt-1 flex flex-wrap gap-1">
                {persona.heldOut.items.map((id) => (
                  <li key={id} title={items[id].name} className="rounded border border-[#b9e2cf] bg-good-soft px-1.5 py-0.5 text-[11.5px] text-[#0b5a40]">
                    {shortName(items[id], 22)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
              Đơn cuối cùng của mỗi khách được giữ lại làm đáp án, không dùng để khai thác. Bấm để so gợi ý với đơn đó.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
