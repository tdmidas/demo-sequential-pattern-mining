import { gsp } from "./gsp.ts";
import { prefixspan } from "./prefixspan.ts";
import { spade } from "./spade.ts";
import type { AlgorithmId, MineOptions, MineResult, Sequence } from "./types.ts";

export * from "./types.ts";
export * from "./rules.ts";
export { gsp, spade, prefixspan };

export const ALGORITHMS: { id: AlgorithmId; name: string; family: string; year: number; authors: string }[] = [
  { id: "gsp", name: "GSP", family: "Apriori, dữ liệu ngang", year: 1996, authors: "Srikant & Agrawal" },
  { id: "spade", name: "SPADE", family: "Dữ liệu dọc, id-list", year: 2001, authors: "Zaki" },
  { id: "prefixspan", name: "PrefixSpan", family: "Pattern-growth", year: 2001, authors: "Pei và cộng sự" },
];

export function mine(algorithm: AlgorithmId, sequences: Sequence[], opts: MineOptions): MineResult {
  if (algorithm === "gsp") return gsp(sequences, opts);
  if (algorithm === "spade") return spade(sequences, opts);
  return prefixspan(sequences, opts);
}

/**
 * CSDL "cửa hàng mini" dùng ở trang Minh hoạ: 4 khách, 3 món (0 = Nến, 1 = Thảm, 2 = Giỏ).
 * Đủ nhỏ để tính tay: ở minsup 2 có đúng 6 mẫu phổ biến.
 */
export const MINI_ITEMS = [
  { label: "Nến", image: "/products/85123A.jpg" },
  { label: "Thảm", image: "/products/48138.jpg" },
  { label: "Giỏ", image: "/products/22501.jpg" },
];
export const MINI_DB: Sequence[] = [
  [[0], [1], [2]],
  [[0], [1]],
  [[0, 1], [2]],
  [[1], [0], [2]],
];

/** CSDL ví dụ kinh điển trong bài báo PrefixSpan (Pei et al.), item a..g = 0..6. */
export const TOY_ITEMS = ["a", "b", "c", "d", "e", "f", "g"];
export const TOY_DB: Sequence[] = [
  [[0], [0, 1, 2], [0, 2], [3], [2, 5]],
  [[0, 3], [2], [1, 2], [0, 4]],
  [[4, 5], [0, 1], [3, 5], [2], [1]],
  [[4], [6], [0, 5], [2], [1], [2]],
];
