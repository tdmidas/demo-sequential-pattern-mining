import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { recommend } from "@/lib/mining";
import { DEFAULTS, dataset, recModel } from "@/lib/server/store";

/** Danh mục sản phẩm + một số khách hàng mẫu (có lịch sử vừa phải) để đóng vai khi demo. */
export async function GET() {
  const data = dataset();
  // Ứng viên: khách có lịch sử dễ đọc (3-8 đơn, giỏ không quá lớn), rải đều trong dữ liệu.
  const model = recModel(DEFAULTS.minsupPct, DEFAULTS.maxLength);
  const pool = [];
  const step = Math.max(1, Math.floor(data.customers.length / 80));
  for (let i = 7; i < data.customers.length; i += step) {
    for (let j = i; j < Math.min(i + step, data.customers.length); j++) {
      const c = data.customers[j];
      const history = c.baskets.slice(0, -1);
      const heldOut = c.baskets.at(-1)!;
      const biggest = Math.max(...c.baskets.map((b) => b.items.length));
      if (history.length >= 3 && history.length <= 8 && biggest <= 12 && heldOut.items.length >= 2) {
        const recs = recommend(model, history.map((b) => b.items), { k: 10 });
        const hits = recs.filter((r) => heldOut.items.includes(r.item)).length;
        pool.push({ id: c.id, country: c.country, history, heldOut, hits });
        break;
      }
    }
  }
  // Danh sách demo: 9 khách mà gợi ý trúng đơn thật nhiều nhất, kèm 3 khách gợi ý trượt hoàn toàn
  // (để phần trình bày không chỉ toàn trường hợp đẹp).
  const ranked = [...pool].sort((x, y) => y.hits - x.hits);
  const misses = ranked.filter((p) => p.hits === 0).slice(0, 3);
  const personas = [...ranked.slice(0, 9), ...misses.filter((m) => !ranked.slice(0, 9).includes(m))];
  // Ảnh sản phẩm là tuỳ chọn: thiếu ảnh nào thì giao diện dùng biểu tượng theo nhóm hàng.
  const dir = path.join(process.cwd(), "public", "products");
  const have = new Set(existsSync(dir) ? readdirSync(dir) : []);
  const items = data.items.map((it) => (have.has(`${it.code}.jpg`) ? { ...it, image: `/products/${it.code}.jpg` } : it));
  return Response.json({
    items,
    categories: data.categories,
    personas,
    sequences: data.train.length,
  });
}
