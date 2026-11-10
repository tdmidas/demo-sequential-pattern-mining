// Kiểu dữ liệu dùng chung cho 3 thuật toán khai thác mẫu tuần tự.
// Một chuỗi (sequence) là danh sách có thứ tự các itemset; mỗi itemset là mảng id tăng dần.

export type Itemset = number[];
export type Sequence = Itemset[];
export type Pattern = Itemset[];

export type AlgorithmId = "gsp" | "spade" | "prefixspan";

export interface MineOptions {
  /** Ngưỡng support tuyệt đối (số chuỗi). */
  minSupport: number;
  /** Số item tối đa trong một mẫu. */
  maxLength: number;
  /** Số item khác nhau trong CSDL (id chạy từ 0..nItems-1). */
  nItems: number;
  /** Dừng sớm nếu chạy quá thời gian này. */
  timeBudgetMs?: number;
  /** Ghi vết từng bước, chỉ dùng cho CSDL nhỏ ở trang minh hoạ. */
  trace?: (event: TraceEvent) => void;
}

export interface LevelStat {
  /** Độ dài mẫu (số item). */
  k: number;
  /** Số mẫu phải đếm support ở mức này. */
  counted: number;
  /** Số mẫu phổ biến tìm được. */
  frequent: number;
}

export interface MineStats {
  algorithm: AlgorithmId;
  timeMs: number;
  timedOut: boolean;
  /** Số lần duyệt toàn bộ CSDL gốc. */
  dbScans: number;
  /** GSP: ứng viên sinh ra trước khi tỉa. Các thuật toán khác: bằng `counted`. */
  generated: number;
  /** Tổng số mẫu phải đếm support (GSP: ứng viên sau tỉa; SPADE: phép join; PrefixSpan: mở rộng xuất hiện trong CSDL chiếu). */
  counted: number;
  patterns: number;
  /** Số phép toán cơ bản (GSP: kiểm tra chứa; SPADE: phần tử id-list đã duyệt; PrefixSpan: item đã duyệt trong CSDL chiếu). */
  ops: number;
  /** Đỉnh số phần tử của cấu trúc phụ cùng tồn tại trong bộ nhớ (ứng viên / id-list / con trỏ chiếu). */
  peakEntries: number;
  /** Tổng số phần tử cấu trúc phụ đã tạo ra trong cả quá trình. */
  totalEntries: number;
  /** PrefixSpan: số CSDL chiếu đã tạo. SPADE: số phép join. GSP: số mức. */
  structures: number;
  levels: LevelStat[];
}

export interface MineResult {
  /** key của mẫu -> support. */
  patterns: Map<string, number>;
  stats: MineStats;
}

export type TraceEvent =
  | {
      type: "gsp-level";
      k: number;
      generated: Pattern[];
      pruned: Pattern[];
      counted: { pattern: Pattern; support: number; frequent: boolean }[];
    }
  | { type: "spade-vertical"; item: number; idlist: [number, number][]; support: number; frequent: boolean }
  | {
      type: "spade-join";
      a: Pattern;
      b: Pattern;
      kind: "equality" | "temporal";
      result: Pattern;
      idlist: [number, number][];
      support: number;
      frequent: boolean;
    }
  | {
      type: "prefixspan-project";
      prefix: Pattern;
      support: number;
      projected: { sid: number; from: number; partial: number[] | null }[];
      extensions: { item: number; kind: "s" | "i"; support: number; frequent: boolean }[];
    };

/** Khoá chuỗi của một mẫu: item cách nhau bởi ",", itemset cách nhau bởi "|". Ví dụ "3,5|7". */
export function keyOf(pattern: Pattern): string {
  let s = "";
  for (let i = 0; i < pattern.length; i++) {
    if (i) s += "|";
    s += pattern[i].join(",");
  }
  return s;
}

export function parseKey(key: string): Pattern {
  return key.split("|").map((el) => el.split(",").map(Number));
}

export function patternLength(pattern: Pattern): number {
  let n = 0;
  for (const el of pattern) n += el.length;
  return n;
}

/** Mở rộng kiểu sequence (s-extension): thêm item thành một itemset mới ở cuối. */
export function sExtend(pattern: Pattern, item: number): Pattern {
  return [...pattern, [item]];
}

/** Mở rộng kiểu itemset (i-extension): thêm item vào itemset cuối. */
export function iExtend(pattern: Pattern, item: number): Pattern {
  const out = pattern.slice(0, -1);
  out.push([...pattern[pattern.length - 1], item]);
  return out;
}

/**
 * CSDL đã đánh chỉ mục: mỗi giỏ hàng có một hàng bitmap để kiểm tra
 * "itemset ⊆ giỏ hàng" trong O(|itemset|).
 */
export interface IndexedDb {
  sequences: Sequence[];
  nItems: number;
  /** Vị trí giỏ đầu tiên của chuỗi i trong bitmap. */
  offset: Int32Array;
  /** basketHas[(offset[sid] + eid) * nItems + item] = 1 nếu giỏ chứa item. */
  basketHas: Uint8Array;
}

export function indexDb(sequences: Sequence[], nItems: number): IndexedDb {
  const offset = new Int32Array(sequences.length + 1);
  for (let i = 0; i < sequences.length; i++) offset[i + 1] = offset[i] + sequences[i].length;
  const basketHas = new Uint8Array(offset[sequences.length] * nItems);
  for (let s = 0; s < sequences.length; s++) {
    const seq = sequences[s];
    for (let e = 0; e < seq.length; e++) {
      const base = (offset[s] + e) * nItems;
      for (const item of seq[e]) basketHas[base + item] = 1;
    }
  }
  return { sequences, nItems, offset, basketHas };
}

/** Mẫu có là chuỗi con của sequence không (khớp tham lam từ trái sang). */
export function containsPattern(seq: Sequence, pattern: Pattern): boolean {
  let e = 0;
  for (const el of pattern) {
    let found = false;
    for (; e < seq.length; e++) {
      if (isSubset(el, seq[e])) {
        found = true;
        e++;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/** a ⊆ b với a, b là mảng tăng dần. */
export function isSubset(a: number[], b: number[]): boolean {
  if (a.length > b.length) return false;
  let j = 0;
  for (const x of a) {
    while (j < b.length && b[j] < x) j++;
    if (j >= b.length || b[j] !== x) return false;
    j++;
  }
  return true;
}

export function emptyStats(algorithm: AlgorithmId): MineStats {
  return {
    algorithm,
    timeMs: 0,
    timedOut: false,
    dbScans: 0,
    generated: 0,
    counted: 0,
    patterns: 0,
    ops: 0,
    peakEntries: 0,
    totalEntries: 0,
    structures: 0,
    levels: [],
  };
}

export function bumpLevel(levels: LevelStat[], k: number, counted: number, frequent: number): void {
  let lv = levels.find((l) => l.k === k);
  if (!lv) {
    lv = { k, counted: 0, frequent: 0 };
    levels.push(lv);
    levels.sort((a, b) => a.k - b.k);
  }
  lv.counted += counted;
  lv.frequent += frequent;
}
