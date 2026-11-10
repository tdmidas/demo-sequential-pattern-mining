import { type AlgorithmId, type Method, recommend } from "@/lib/mining";
import { DEFAULTS, clampParams, dataset, recModelBy } from "@/lib/server/store";

const METHODS: Method[] = ["sequential", "association", "popularity"];
const ALGORITHMS: AlgorithmId[] = ["gsp", "spade", "prefixspan"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { minsupPct, maxLength } = clampParams(body);
  const nItems = dataset().items.length;
  const history: number[][] = Array.isArray(body.history)
    ? body.history
        .filter((b: unknown) => Array.isArray(b))
        .map((b: unknown[]) => [...new Set(b.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x < nItems))].sort((x, y) => x - y))
        .filter((b: number[]) => b.length > 0)
    : [];
  const method: Method = METHODS.includes(body.method) ? body.method : "sequential";
  const started = performance.now();
  const algorithm: AlgorithmId = ALGORITHMS.includes(body.algorithm) ? body.algorithm : "prefixspan";
  const { model, stats } = recModelBy(algorithm, minsupPct, maxLength);
  const recommendations = recommend(model, history, {
    method,
    k: Math.min(20, Math.max(1, Number(body.k) || 10)),
    minConfidence: Number(body.minConfidence ?? DEFAULTS.minConfidence),
    excludeBought: body.excludeBought === true,
  });
  return Response.json({
    recommendations,
    method,
    model: {
      minsupPct,
      maxLength,
      minSupport: model.minSupport,
      rules: model.rules.length,
      sequences: model.nSequences,
      algorithm,
      mineMs: stats.timeMs,
      timedOut: stats.timedOut,
      patterns: stats.patterns,
      counted: stats.counted,
      dbScans: stats.dbScans,
    },
    tookMs: performance.now() - started,
  });
}
