import { type AlgorithmId, buildRules, condense, parseKey, patternLength } from "@/lib/mining";
import { TIME_BUDGET_MS, clampParams, dataset, runMining } from "@/lib/server/store";

const IDS: AlgorithmId[] = ["gsp", "spade", "prefixspan"];
const MAX_ROWS = 400;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { minsupPct, maxLength } = clampParams(body);
  const algorithm: AlgorithmId = IDS.includes(body.algorithm) ? body.algorithm : "prefixspan";
  const data = dataset();
  const { patterns, stats, minSupport } = runMining(algorithm, minsupPct, maxLength);

  const { closed, maximal } = condense(patterns);
  const byLength: Record<number, { all: number; closed: number; maximal: number }> = {};
  const rows: { p: number[][]; s: number; c: boolean; m: boolean; k: number }[] = [];
  for (const [key, support] of patterns) {
    const p = parseKey(key);
    const k = patternLength(p);
    const slot = (byLength[k] ??= { all: 0, closed: 0, maximal: 0 });
    slot.all++;
    if (closed.has(key)) slot.closed++;
    if (maximal.has(key)) slot.maximal++;
    if (k >= 2) rows.push({ p, s: support, c: closed.has(key), m: maximal.has(key), k });
  }
  rows.sort((a, b) => b.s - a.s);
  const rules = buildRules(patterns, data.train.length);

  return Response.json({
    algorithm,
    minsupPct,
    maxLength,
    minSupport,
    sequences: data.train.length,
    budgetMs: TIME_BUDGET_MS,
    stats,
    byLength,
    closedCount: closed.size,
    maximalCount: maximal.size,
    patternRows: rows.slice(0, MAX_ROWS),
    patternRowsTotal: rows.length,
    ruleCount: rules.length,
    rules: rules.slice(0, MAX_ROWS),
  });
}
