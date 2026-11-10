// Từ mẫu tuần tự phổ biến -> luật tuần tự -> gợi ý "sản phẩm mua tiếp theo",
// cùng hai baseline (luật kết hợp không xét thứ tự, sản phẩm bán chạy) và phần đánh giá offline.

import { type Pattern, type Sequence, isSubset, keyOf, parseKey } from "./types.ts";

// ---------------------------------------------------------------------------
// Mẫu đóng (closed)
// ---------------------------------------------------------------------------

/**
 * Mẫu đóng: không có mẫu cha nào cùng support. Lọc hậu kỳ trên tập mẫu đã khai thác:
 * nếu P có support bằng một mẫu con (bỏ 1 item) thì mẫu con đó không đóng.
 * (Mẫu ở độ dài tối đa luôn được coi là đóng vì không khai thác mẫu cha của chúng.)
 */
export function closedPatternKeys(patterns: Map<string, number>): Set<string> {
  return condense(patterns).closed;
}

/**
 * Hai cách rút gọn tập mẫu:
 *  - closed  : bỏ mẫu có mẫu cha cùng support (không mất thông tin support).
 *  - maximal : bỏ mẫu có bất kỳ mẫu cha phổ biến nào (gọn hơn nhưng mất support của mẫu con).
 */
export function condense(patterns: Map<string, number>): { closed: Set<string>; maximal: Set<string> } {
  const notClosed = new Set<string>();
  const notMaximal = new Set<string>();
  for (const [key, support] of patterns) {
    const p = parseKey(key);
    for (let e = 0; e < p.length; e++) {
      for (let i = 0; i < p[e].length; i++) {
        const sub =
          p[e].length === 1
            ? [...p.slice(0, e), ...p.slice(e + 1)]
            : [...p.slice(0, e), p[e].filter((_, j) => j !== i), ...p.slice(e + 1)];
        if (sub.length === 0) continue;
        const subKey = keyOf(sub);
        notMaximal.add(subKey);
        if (patterns.get(subKey) === support) notClosed.add(subKey);
      }
    }
  }
  const closed = new Set<string>();
  const maximal = new Set<string>();
  for (const key of patterns.keys()) {
    if (!notClosed.has(key)) closed.add(key);
    if (!notMaximal.has(key)) maximal.add(key);
  }
  return { closed, maximal };
}

// ---------------------------------------------------------------------------
// Luật tuần tự
// ---------------------------------------------------------------------------

export interface Rule {
  /** Vế trái: chuỗi các giỏ hàng đã mua. */
  antecedent: Pattern;
  /** Vế phải: sản phẩm mua ở lần kế tiếp. */
  consequent: number;
  /** Số khách có chuỗi chứa cả mẫu. */
  support: number;
  /** sup(antecedent -> consequent) / sup(antecedent). */
  confidence: number;
  /** confidence / tỷ lệ khách từng mua consequent. > 1 nghĩa là có tương quan dương. */
  lift: number;
}

/**
 * Mỗi mẫu <X1 ... Xn, {y}> (itemset cuối chỉ có 1 item) cho một luật <X1 ... Xn> => y.
 * Vì mọi tiền tố của mẫu phổ biến cũng phổ biến nên support của vế trái luôn có sẵn.
 */
export function buildRules(patterns: Map<string, number>, nSequences: number): Rule[] {
  const rules: Rule[] = [];
  for (const [key, support] of patterns) {
    const cut = key.lastIndexOf("|");
    if (cut < 0) continue;
    const tail = key.slice(cut + 1);
    if (tail.includes(",")) continue;
    const antSupport = patterns.get(key.slice(0, cut));
    const consequent = Number(tail);
    const consSupport = patterns.get(tail);
    if (!antSupport || !consSupport) continue;
    const confidence = support / antSupport;
    rules.push({
      antecedent: parseKey(key.slice(0, cut)),
      consequent,
      support,
      confidence,
      lift: confidence / (consSupport / nSequences),
    });
  }
  rules.sort((a, b) => b.confidence - a.confidence || b.support - a.support);
  return rules;
}

// ---------------------------------------------------------------------------
// Mô hình gợi ý
// ---------------------------------------------------------------------------

export type Method = "sequential" | "association" | "popularity";

export interface RecModel {
  nSequences: number;
  nItems: number;
  /** Số khách (chuỗi) có mua item. */
  itemSupport: number[];
  /** Item xếp theo độ phổ biến giảm dần. */
  popular: number[];
  rules: Rule[];
  /** Luật tuần tự nhóm theo item hiếm nhất của vế trái, để chỉ thử những luật có khả năng khớp. */
  rulesByItem: Map<number, Rule[]>;
  /** co[x * nItems + y] = số khách mua cả x và y (không xét thứ tự). */
  co: Int32Array;
  minSupport: number;
}

export function buildRecModel(
  sequences: Sequence[],
  nItems: number,
  patterns: Map<string, number>,
  minSupport: number,
): RecModel {
  const itemSupport = new Array<number>(nItems).fill(0);
  const co = new Int32Array(nItems * nItems);
  for (const seq of sequences) {
    const set = [...new Set(seq.flat())];
    for (const x of set) {
      itemSupport[x]++;
      for (const y of set) if (x !== y) co[x * nItems + y]++;
    }
  }
  const popular = itemSupport.map((_, i) => i).sort((a, b) => itemSupport[b] - itemSupport[a]);
  const rules = buildRules(patterns, sequences.length);
  const rulesByItem = new Map<number, Rule[]>();
  for (const r of rules) {
    let rare = -1;
    for (const el of r.antecedent) for (const x of el) if (rare < 0 || itemSupport[x] < itemSupport[rare]) rare = x;
    const list = rulesByItem.get(rare);
    if (list) list.push(r);
    else rulesByItem.set(rare, [r]);
  }
  return { nSequences: sequences.length, nItems, itemSupport, popular, rules, rulesByItem, co, minSupport };
}

export type Why =
  | { type: "sequential"; antecedent: Pattern; confidence: number; support: number; lift: number; gap: number }
  | { type: "association"; given: number; confidence: number; support: number; lift: number }
  | { type: "popularity"; buyers: number; share: number };

export interface Recommendation {
  item: number;
  score: number;
  /** true nếu phương pháp chính không đủ gợi ý và phải lấy thêm từ danh sách bán chạy. */
  fallback: boolean;
  why: Why;
}

export interface RecommendOptions {
  method: Method;
  k: number;
  /** Ngưỡng confidence tối thiểu của luật. */
  minConfidence: number;
  /** Bỏ các sản phẩm khách đã từng mua (gợi ý sản phẩm mới thay vì mua lại). */
  excludeBought: boolean;
  /** Chỉ xét N giỏ gần nhất. */
  window: number;
  /** Hệ số giảm điểm theo số giỏ đã trôi qua kể từ khi vế trái khớp. */
  decay: number;
  /** Thêm sản phẩm bán chạy khi luật không đủ k gợi ý. */
  fallback: boolean;
}

export const DEFAULT_REC_OPTIONS: RecommendOptions = {
  method: "sequential",
  k: 10,
  minConfidence: 0.1,
  excludeBought: false,
  window: 5,
  decay: 0.85,
  fallback: true,
};

/**
 * Khớp vế trái vào lịch sử theo hướng từ mới về cũ và trả về số giỏ đã trôi qua
 * kể từ giỏ khớp với itemset cuối (0 = giỏ gần nhất). -1 nếu không khớp.
 */
export function latestMatchGap(history: Sequence, antecedent: Pattern): number {
  let idx = history.length - 1;
  let gap = -1;
  for (let a = antecedent.length - 1; a >= 0; a--) {
    while (idx >= 0 && !isSubset(antecedent[a], history[idx])) idx--;
    if (idx < 0) return -1;
    if (gap < 0) gap = history.length - 1 - idx;
    idx--;
  }
  return gap;
}

export function recommend(model: RecModel, fullHistory: Sequence, options: Partial<RecommendOptions> = {}): Recommendation[] {
  const o = { ...DEFAULT_REC_OPTIONS, ...options };
  const history = fullHistory.slice(-o.window);
  const bought = new Set(fullHistory.flat());
  const recent = new Set(history.flat());
  const best = new Map<number, Recommendation>();
  const offer = (rec: Recommendation) => {
    if (o.excludeBought && bought.has(rec.item)) return;
    const cur = best.get(rec.item);
    if (!cur || rec.score > cur.score) best.set(rec.item, rec);
  };

  if (o.method === "sequential") {
    for (const item of recent) {
      const candidates = model.rulesByItem.get(item);
      if (!candidates) continue;
      for (const r of candidates) {
        if (r.confidence < o.minConfidence) break; // danh sách đã sắp giảm dần theo confidence
        const gap = latestMatchGap(history, r.antecedent);
        if (gap < 0) continue;
        offer({
          item: r.consequent,
          score: r.confidence * Math.pow(o.decay, gap),
          fallback: false,
          why: { type: "sequential", antecedent: r.antecedent, confidence: r.confidence, support: r.support, lift: r.lift, gap },
        });
      }
    }
  } else if (o.method === "association") {
    const n = model.nItems;
    for (const x of recent) {
      for (let y = 0; y < n; y++) {
        const both = model.co[x * n + y];
        if (both < model.minSupport) continue;
        const confidence = both / model.itemSupport[x];
        if (confidence < o.minConfidence) continue;
        offer({
          item: y,
          score: confidence,
          fallback: false,
          why: {
            type: "association",
            given: x,
            confidence,
            support: both,
            lift: confidence / (model.itemSupport[y] / model.nSequences),
          },
        });
      }
    }
  }

  const out = [...best.values()].sort((a, b) => b.score - a.score || a.item - b.item).slice(0, o.k);
  if (out.length < o.k && (o.fallback || o.method === "popularity")) {
    const have = new Set(out.map((r) => r.item));
    for (const item of model.popular) {
      if (out.length >= o.k) break;
      if (have.has(item) || (o.excludeBought && bought.has(item))) continue;
      out.push({
        item,
        score: model.itemSupport[item] / model.nSequences,
        fallback: o.method !== "popularity",
        why: { type: "popularity", buyers: model.itemSupport[item], share: model.itemSupport[item] / model.nSequences },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Đánh giá offline: giấu giỏ cuối của mỗi khách, dự đoán từ các giỏ trước
// ---------------------------------------------------------------------------

export interface EvalCase {
  history: Sequence;
  target: number[];
}

export interface EvalMetrics {
  method: Method;
  k: number;
  /** Số khách được đánh giá (giỏ đáp án còn ít nhất 1 sản phẩm hợp lệ). */
  users: number;
  /** Tỷ lệ khách có ít nhất 1 gợi ý trúng giỏ đáp án. */
  hitRate: number;
  precision: number;
  recall: number;
  /** Trung bình 1 / thứ hạng của gợi ý trúng đầu tiên. */
  mrr: number;
  /** Tỷ lệ sản phẩm trong danh mục từng xuất hiện trong gợi ý. */
  catalogCoverage: number;
  /** Tỷ lệ khách nhận được ít nhất 1 gợi ý từ luật (không phải fallback). */
  ruleCoverage: number;
}

export function evaluate(model: RecModel, cases: EvalCase[], options: Partial<RecommendOptions>): EvalMetrics {
  const o = { ...DEFAULT_REC_OPTIONS, ...options };
  let users = 0;
  let hits = 0;
  let precision = 0;
  let recall = 0;
  let mrr = 0;
  let served = 0;
  const shown = new Set<number>();
  for (const c of cases) {
    let target = c.target;
    if (o.excludeBought) {
      const bought = new Set(c.history.flat());
      target = target.filter((x) => !bought.has(x));
    }
    if (target.length === 0) continue;
    users++;
    const wanted = new Set(target);
    const recs = recommend(model, c.history, o);
    let hit = 0;
    let firstRank = 0;
    let fromRule = false;
    recs.forEach((r, i) => {
      shown.add(r.item);
      if (!r.fallback && r.why.type !== "popularity") fromRule = true;
      if (wanted.has(r.item)) {
        hit++;
        if (!firstRank) firstRank = i + 1;
      }
    });
    if (fromRule) served++;
    if (hit) hits++;
    precision += hit / o.k;
    recall += hit / target.length;
    if (firstRank) mrr += 1 / firstRank;
  }
  const d = Math.max(users, 1);
  return {
    method: o.method,
    k: o.k,
    users,
    hitRate: hits / d,
    precision: precision / d,
    recall: recall / d,
    mrr: mrr / d,
    catalogCoverage: shown.size / model.nItems,
    ruleCoverage: o.method === "popularity" ? 0 : served / d,
  };
}
