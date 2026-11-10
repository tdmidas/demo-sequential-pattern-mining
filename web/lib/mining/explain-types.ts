// Kiểu dữ liệu trả về của /api/explain (dùng chung cho server và trang Minh hoạ).

import type { Extension } from "./explain.ts";
import type { Recommendation } from "./rules.ts";
import type { AlgorithmId, Pattern } from "./types.ts";

export interface ExplainStep {
  pattern: Pattern;
  item: number;
  kind: "s" | "i";
  /** Số khách chứa mẫu, đếm trực tiếp trên CSDL. */
  support: number;
  holders: number;
  /** Chỉ số (trong CSDL) của mọi khách chứa mẫu, để vẽ từng khách thành một chấm. */
  sids: number[];
  /** Vài khách thật chứa mẫu, kèm vị trí các đơn khớp. */
  hits: { customer: number; baskets: number[][]; pos: number[] }[];
  /** GSP: số ứng viên và số mẫu phổ biến của cả mức này. */
  gsp: { counted: number; frequent: number } | null;
  /** SPADE: kích thước id-list của chính mẫu này. */
  vertical: { rows: number; customers: number };
  /** SPADE: phép ghép tạo ra mẫu này (null ở bước đầu). */
  spade: null | {
    a: Pattern;
    b: Pattern;
    join: "temporal" | "equality";
    aRows: number;
    aCustomers: number;
    bRows: number;
    bCustomers: number;
    rows: number;
    customers: number;
    /** Chỉ số các khách có mặt trong danh sách B. */
    bSids: number[];
    sample: { customer: number; a: number[]; b: number[]; kept: number[] }[];
  };
  /** PrefixSpan: CSDL chiếu theo mẫu của bước trước và các cách mở rộng đếm được trong đó. */
  prefixspan: {
    prefix: Pattern;
    projected: number;
    distinct: number;
    frequent: number;
    top: Extension[];
    target: Extension & { rank: number };
    samples: { customer: number; baskets: number[][]; end: number }[];
  };
}

export interface ExplainResponse {
  sequences: number;
  /** Mã khách theo đúng thứ tự trong CSDL (chấm thứ i là khách ids[i]). */
  ids: number[];
  nItems: number;
  minsupPct: number;
  minSupport: number;
  ranking: Recommendation[];
  stats: { algorithm: AlgorithmId; timeMs: number; counted: number; dbScans: number; patterns: number; peakEntries: number; timedOut: boolean }[];
  /** null nếu không có gợi ý nào đến từ luật tuần tự. */
  item: number | null;
  rule: null | {
    antecedent: Pattern;
    consequent: number;
    support: number;
    antSupport: number;
    consSupport: number;
    confidence: number;
    lift: number;
    gap: number;
    decay: number;
    score: number;
  };
  /** Vị trí (trong lịch sử của khách) các đơn khớp với vế trái của luật. */
  matched: number[];
  chain: ExplainStep[];
}
