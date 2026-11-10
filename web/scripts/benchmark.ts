// Chạy thực nghiệm so sánh 3 thuật toán và lưu vào data/benchmark.json để trang "So sánh" hiển thị ngay.
// Chạy:  node scripts/benchmark.ts        (mất vài phút)

import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadDataset, toMinSupport } from "../lib/data.ts";
import {
  ALGORITHMS,
  type MineStats,
  type Method,
  buildRecModel,
  condense,
  evaluate,
  mine,
  parseKey,
  patternLength,
} from "../lib/mining/index.ts";

const BUDGET_MS = 30000;
const data = loadDataset(path.join(import.meta.dirname, "..", "data"));
const nItems = data.items.length;
const METHODS: Method[] = ["sequential", "association", "popularity"];

function runAll(db: typeof data.train, minSupport: number, maxLength: number) {
  const runs: MineStats[] = [];
  let patterns: Map<string, number> | null = null;
  for (const a of ALGORITHMS) {
    // lấy lần chạy nhanh hơn trong 2 lần để giảm nhiễu do JIT / GC
    let best: ReturnType<typeof mine> | null = null;
    for (let rep = 0; rep < 2; rep++) {
      const r = mine(a.id, db, { minSupport, maxLength, nItems, timeBudgetMs: BUDGET_MS });
      if (!best || r.stats.timeMs < best.stats.timeMs) best = r;
      if (r.stats.timedOut || r.stats.timeMs > 8000) break;
    }
    runs.push(best!.stats);
    if (!best!.stats.timedOut) patterns = best!.patterns;
    console.log(`  ${a.id.padEnd(10)} ${best!.stats.timeMs.toFixed(0)}ms patterns=${best!.stats.patterns}${best!.stats.timedOut ? " TIMEOUT" : ""}`);
  }
  return { runs, patterns };
}

// ---- 1. Thay đổi minsup ------------------------------------------------------
const MAX_LEN = 3;
const byMinsup = [];
for (const pct of [10, 8, 6, 5, 4, 3, 2.5, 2, 1.5]) {
  const minSupport = toMinSupport(pct, data.train.length);
  console.log(`minsup ${pct}% (${minSupport})`);
  const { runs, patterns } = runAll(data.train, minSupport, MAX_LEN);
  const row: Record<string, unknown> = { minsupPct: pct, minSupport, maxLength: MAX_LEN, runs };
  if (patterns) {
    const byLength: Record<number, number> = {};
    for (const key of patterns.keys()) {
      const k = patternLength(parseKey(key));
      byLength[k] = (byLength[k] ?? 0) + 1;
    }
    const model = buildRecModel(data.train, nItems, patterns, minSupport);
    const consequents = new Set(model.rules.filter((r) => r.confidence >= 0.1).map((r) => r.consequent));
    row.patterns = patterns.size;
    const cond = condense(patterns);
    row.closed = cond.closed.size;
    row.maximal = cond.maximal.size;
    row.byLength = byLength;
    row.rules = model.rules.length;
    row.itemsWithRule = consequents.size;
    row.eval = METHODS.map((method) => evaluate(model, data.cases, { method, k: 10, excludeBought: true }));
    row.evalRepeat = METHODS.map((method) => evaluate(model, data.cases, { method, k: 10, excludeBought: false }));
    row.evalNoFallback = evaluate(model, data.cases, { method: "sequential", k: 10, excludeBought: true, fallback: false });
  }
  byMinsup.push(row);
}

// ---- 2. Thay đổi kích thước CSDL (minsup tương đối giữ nguyên 3%) ---------------
const bySize = [];
for (const frac of [0.25, 0.5, 0.75, 1]) {
  const db = data.train.slice(0, Math.round(data.train.length * frac));
  const minSupport = toMinSupport(3, db.length);
  console.log(`size ${db.length}`);
  bySize.push({ sequences: db.length, minSupport, runs: runAll(db, minSupport, MAX_LEN).runs });
}

// ---- 3. Thay đổi độ dài mẫu tối đa (minsup 4%) ---------------------------------
const byMaxLength = [];
for (const maxLength of [2, 3, 4, 5]) {
  const minSupport = toMinSupport(4, data.train.length);
  console.log(`maxLen ${maxLength}`);
  const { runs, patterns } = runAll(data.train, minSupport, maxLength);
  byMaxLength.push({ maxLength, minSupport, runs, patterns: patterns?.size ?? null });
}

const out = {
  generatedAt: new Date().toISOString(),
  machine: `${process.platform} ${process.arch}, Node ${process.version}`,
  budgetMs: BUDGET_MS,
  sequences: data.train.length,
  items: nItems,
  byMinsup,
  bySize,
  byMaxLength,
};
writeFileSync(path.join(import.meta.dirname, "..", "data", "benchmark.json"), JSON.stringify(out));
console.log("Đã ghi data/benchmark.json");
