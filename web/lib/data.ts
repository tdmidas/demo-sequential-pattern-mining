// Đọc dữ liệu do pipeline/preprocess.py sinh ra (thư mục web/data).
// Dùng chung cho API của web và các script chạy bằng node.

import { readFileSync } from "node:fs";
import path from "node:path";
import type { EvalCase } from "./mining/rules.ts";
import type { Sequence } from "./mining/types.ts";

export interface Item {
  id: number;
  code: string;
  name: string;
  price: number;
  category: string;
  /** Số khách mua trong toàn bộ dữ liệu. */
  buyers: number;
  /** Số chuỗi train chứa sản phẩm. */
  support: number;
  /** Đường dẫn ảnh sản phẩm (nếu đã tải bằng pipeline/fetch_images.py). */
  image?: string;
}

export interface Category {
  key: string;
  label: string;
  count: number;
}

export interface Basket {
  date: string;
  items: number[];
}

export interface Customer {
  id: number;
  country: string;
  baskets: Basket[];
}

export interface Dataset {
  items: Item[];
  categories: Category[];
  customers: Customer[];
  /** CSDL chuỗi dùng để khai thác: mọi giỏ trừ giỏ cuối của mỗi khách. */
  train: Sequence[];
  /** Bộ đánh giá: lịch sử -> giỏ cuối bị giấu. */
  cases: EvalCase[];
}

export function loadDataset(dataDir = path.join(process.cwd(), "data")): Dataset {
  const catalog = JSON.parse(readFileSync(path.join(dataDir, "items.json"), "utf8"));
  const customers: Customer[] = JSON.parse(readFileSync(path.join(dataDir, "customers.json"), "utf8"));
  const train = customers.map((c) => c.baskets.slice(0, -1).map((b) => b.items));
  const cases = customers.map((c, i) => ({ history: train[i], target: c.baskets[c.baskets.length - 1].items }));
  return { items: catalog.items, categories: catalog.categories, customers, train, cases };
}

export function toMinSupport(minsupPct: number, nSequences: number): number {
  return Math.max(1, Math.ceil((minsupPct / 100) * nSequences));
}
