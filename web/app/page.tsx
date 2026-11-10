"use client";

import { useEffect, useState } from "react";
import { CustomerPanel } from "@/components/shop/CustomerPanel";
import { CategoryStrip, ProductGrid, ProductModal } from "@/components/shop/ProductGrid";
import { Recommendations } from "@/components/shop/Recommendations";
import { useShop } from "@/components/shop-context";
import { Note, Spinner } from "@/components/ui";
import type { Item } from "@/lib/data";

export default function ShopPage() {
  const { catalog, error, persona, history } = useShop();
  const [category, setCategory] = useState<string | null>(null);
  const [revealHeldOut, setRevealHeldOut] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);
  useEffect(() => setRevealHeldOut(false), [persona?.id]);

  if (error) {
    return (
      <Note tone="warn" title="Chưa nạp được dữ liệu">
        {error}. Hãy chạy pipeline tiền xử lý để tạo thư mục <code>web/data</code> (xem README).
      </Note>
    );
  }
  if (!catalog) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-ink-2">
        <Spinner /> Đang tải cửa hàng…
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_290px]">
      <div className="min-w-0 space-y-4">
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brand-700 px-6 py-5 text-white">
          <div>
            <h1 className="text-lg font-semibold">{persona ? `Chào mừng trở lại, Khách #${persona.id}` : "Chào mừng bạn đến với NextBasket"}</h1>
            <p className="mt-0.5 text-[13px] text-white/80">
              {history.length > 0
                ? `Bạn đã đặt ${history.length} đơn hàng. Chúng tôi chọn sẵn vài món có thể bạn cần cho lần mua tới.`
                : "Quà tặng, đồ gia dụng và đồ trang trí cho mọi dịp. Khám phá những món đang được mua nhiều nhất."}
            </p>
          </div>
          <a href="#products" className="rounded-md bg-white px-4 py-2 text-[13px] font-semibold text-brand-700 hover:bg-brand-50">
            Xem tất cả sản phẩm
          </a>
        </section>
        <Recommendations revealHeldOut={revealHeldOut} onOpen={setOpen} />
        <CategoryStrip active={category} onPick={setCategory} />
        <ProductGrid category={category} setCategory={setCategory} onOpen={setOpen} />
      </div>
      <aside>
        <CustomerPanel revealHeldOut={revealHeldOut} setRevealHeldOut={setRevealHeldOut} />
      </aside>
      {open && <ProductModal item={open} onClose={() => setOpen(null)} onOpen={setOpen} />}
    </div>
  );
}
