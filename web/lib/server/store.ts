// Trạng thái phía server: dữ liệu đã nạp và các mô hình đã khai thác (cache theo tham số).

import { type Dataset, loadDataset, toMinSupport } from "../data.ts";
import { type AlgorithmId, type MineResult, type MineStats, type RecModel, buildRecModel, mine } from "../mining/index.ts";

export const TIME_BUDGET_MS = 10000;
export const DEFAULTS = { minsupPct: 3, maxLength: 3, minConfidence: 0.1 };

interface Store {
  data?: Dataset;
  patterns: Map<string, Map<string, number>>;
  models: Map<string, RecModel>;
  /** Mô hình theo từng thuật toán khai thác, kèm số liệu của lần chạy đã tạo ra nó. */
  byAlgorithm?: Map<string, { model: RecModel; stats: MineStats }>;
}

const g = globalThis as unknown as { __seqStore?: Store };
const store: Store = (g.__seqStore ??= { patterns: new Map(), models: new Map() });

export function dataset(): Dataset {
  return (store.data ??= loadDataset());
}

export function clampParams(input: { minsupPct?: unknown; maxLength?: unknown }) {
  const pct = Number(input.minsupPct ?? DEFAULTS.minsupPct);
  const len = Number(input.maxLength ?? DEFAULTS.maxLength);
  return {
    minsupPct: Math.min(50, Math.max(1, Number.isFinite(pct) ? pct : DEFAULTS.minsupPct)),
    maxLength: Math.min(5, Math.max(2, Number.isFinite(len) ? Math.round(len) : DEFAULTS.maxLength)),
  };
}

const keyFor = (minsupPct: number, maxLength: number) => `${minsupPct}|${maxLength}`;

/** Chạy một thuật toán (luôn chạy thật để đo thời gian) và lưu tập mẫu nếu chạy trọn vẹn. */
export function runMining(algorithm: AlgorithmId, minsupPct: number, maxLength: number): MineResult & { minSupport: number } {
  const data = dataset();
  const minSupport = toMinSupport(minsupPct, data.train.length);
  const result = mine(algorithm, data.train, {
    minSupport,
    maxLength,
    nItems: data.items.length,
    timeBudgetMs: TIME_BUDGET_MS,
  });
  if (!result.stats.timedOut) store.patterns.set(keyFor(minsupPct, maxLength), result.patterns);
  return { ...result, minSupport };
}

/** Mô hình gợi ý ứng với (minsup, độ dài tối đa). Cả 3 thuật toán cho cùng tập mẫu nên dùng PrefixSpan khi chưa có cache. */
export function recModel(minsupPct: number, maxLength: number): RecModel {
  const key = keyFor(minsupPct, maxLength);
  let model = store.models.get(key);
  if (model) return model;
  const data = dataset();
  const minSupport = toMinSupport(minsupPct, data.train.length);
  const patterns = store.patterns.get(key) ?? runMining("prefixspan", minsupPct, maxLength).patterns;
  model = buildRecModel(data.train, data.items.length, patterns, minSupport);
  if (store.models.size > 12) store.models.delete(store.models.keys().next().value!);
  store.models.set(key, model);
  return model;
}

/**
 * Mô hình gợi ý được khai thác bằng đúng thuật toán người dùng chọn ở trang Cửa hàng.
 * Lần đầu với mỗi bộ (thuật toán, minsup, độ dài) sẽ chạy thật và ghi lại thời gian; các lần sau dùng cache.
 * Nếu thuật toán bị ngắt vì quá thời gian thì mô hình chỉ dựa trên phần mẫu đã tìm được (stats.timedOut = true).
 */
export function recModelBy(algorithm: AlgorithmId, minsupPct: number, maxLength: number): { model: RecModel; stats: MineStats } {
  const cache = (store.byAlgorithm ??= new Map());
  const key = `${algorithm}|${keyFor(minsupPct, maxLength)}`;
  let entry = cache.get(key);
  if (entry) return entry;
  const data = dataset();
  const { patterns, stats, minSupport } = runMining(algorithm, minsupPct, maxLength);
  entry = { model: buildRecModel(data.train, data.items.length, patterns, minSupport), stats };
  if (cache.size > 18) cache.delete(cache.keys().next().value!);
  cache.set(key, entry);
  return entry;
}
