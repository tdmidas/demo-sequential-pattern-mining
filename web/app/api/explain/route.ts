import { type AlgorithmId, type Pattern, type Sequence, isSubset, recommend } from "@/lib/mining";
import { earliestEnd, idListOf, matchPositions, patternChain, projectOn, spadeParents } from "@/lib/mining/explain";
import type { ExplainResponse } from "@/lib/mining/explain-types";
import { DEFAULTS, clampParams, dataset, recModelBy } from "@/lib/server/store";

const ALGORITHMS: AlgorithmId[] = ["gsp", "spade", "prefixspan"];
const WINDOW = 5;
const DECAY = 0.85;

/** Khớp vế trái vào lịch sử theo hướng từ mới về cũ, trả về vị trí các đơn khớp. */
function latestMatch(history: Sequence, antecedent: Pattern): number[] | null {
  const pos: number[] = [];
  let idx = history.length - 1;
  for (let a = antecedent.length - 1; a >= 0; a--) {
    while (idx >= 0 && !isSubset(antecedent[a], history[idx])) idx--;
    if (idx < 0) return null;
    pos.unshift(idx);
    idx--;
  }
  return pos;
}

/**
 * Giải thích một gợi ý trên dữ liệu thật: luật nào tạo ra nó, và mỗi thuật toán phải đi qua
 * những con số nào để đếm được support của mẫu đứng sau luật đó.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { minsupPct, maxLength } = clampParams(body);
  const data = dataset();
  const nItems = data.items.length;
  const db = data.train;
  const history: number[][] = Array.isArray(body.history)
    ? body.history
        .filter((b: unknown) => Array.isArray(b))
        .map((b: unknown[]) => [...new Set(b.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x < nItems))].sort((x, y) => x - y))
        .filter((b: number[]) => b.length > 0)
    : [];

  // Chạy cả ba thuật toán (có cache) để lấy số liệu thật của từng thuật toán ở đúng tham số này
  const runs = ALGORITHMS.map((algorithm) => ({ algorithm, ...recModelBy(algorithm, minsupPct, maxLength) }));
  const model = (runs.find((r) => !r.stats.timedOut) ?? runs[2]).model;
  const options = {
    method: "sequential" as const,
    k: 10,
    minConfidence: Number(body.minConfidence ?? DEFAULTS.minConfidence),
    excludeBought: body.excludeBought === true,
  };
  const ranking = recommend(model, history, options);
  const wanted = Number(body.item);
  const rec = ranking.find((r) => r.item === wanted && r.why.type === "sequential") ?? ranking.find((r) => r.why.type === "sequential");
  const base = {
    sequences: db.length,
    ids: db.map((_, sid) => data.customers[sid].id),
    nItems,
    minsupPct,
    minSupport: model.minSupport,
    ranking,
    stats: runs.map((r) => ({
      algorithm: r.algorithm,
      timeMs: r.stats.timeMs,
      counted: r.stats.counted,
      dbScans: r.stats.dbScans,
      patterns: r.stats.patterns,
      peakEntries: r.stats.peakEntries,
      timedOut: r.stats.timedOut,
    })),
  };
  if (!rec || rec.why.type !== "sequential") {
    return Response.json({ ...base, item: null, rule: null, matched: [], chain: [] } satisfies ExplainResponse);
  }

  const why = rec.why;
  const full: Pattern = [...why.antecedent, [rec.item]];
  const chain = patternChain(full);
  const support = (p: Pattern) => db.reduce((n, s) => n + (earliestEnd(s, p) >= 0 ? 1 : 0), 0);
  const readable = (sid: number) => db[sid].length <= 6 && db[sid].every((b) => b.length <= 5);
  const customer = (sid: number) => data.customers[sid].id;

  const steps = chain.map((step, k) => {
    const level = k + 1;
    // khách chứa mẫu: ưu tiên những người có lịch sử ngắn để dễ đọc
    const holders: number[] = [];
    for (let sid = 0; sid < db.length; sid++) if (earliestEnd(db[sid], step.pattern) >= 0) holders.push(sid);
    const nice = holders.filter(readable);
    const hits = (nice.length >= 3 ? nice : holders).slice(0, 4).map((sid) => ({
      customer: customer(sid),
      baskets: db[sid],
      pos: matchPositions(db[sid], step.pattern) ?? [],
    }));

    const gspLevel = runs[0].stats.levels.find((l) => l.k === level);

    let spade: ExplainResponse["chain"][number]["spade"] = null;
    const own = idListOf(db, step.pattern);
    if (k >= 1) {
      const { a, b, join } = spadeParents(chain, k);
      const aList = idListOf(db, a);
      const bList = idListOf(db, b);
      const group = (list: [number, number][]) => {
        const m = new Map<number, number[]>();
        for (const [sid, e] of list) (m.get(sid) ?? m.set(sid, []).get(sid)!).push(e);
        return m;
      };
      const ga = group(aList);
      const gb = group(bList);
      const gr = group(own);
      const kept = [...gr.keys()].slice(0, 4);
      const dropped = [...ga.keys()].filter((sid) => gb.has(sid) && !gr.has(sid)).slice(0, 2);
      const onlyA = dropped.length ? [] : [...ga.keys()].filter((sid) => !gb.has(sid)).slice(0, 1);
      spade = {
        a,
        b,
        join,
        aRows: aList.length,
        aCustomers: ga.size,
        bRows: bList.length,
        bCustomers: gb.size,
        rows: own.length,
        customers: gr.size,
        bSids: [...gb.keys()],
        sample: [...kept, ...dropped, ...onlyA].map((sid) => ({
          customer: customer(sid),
          a: ga.get(sid) ?? [],
          b: gb.get(sid) ?? [],
          kept: gr.get(sid) ?? [],
        })),
      };
    }

    const prefix: Pattern = k === 0 ? [] : chain[k - 1].pattern;
    const proj = projectOn(db, prefix, nItems);
    const rank = proj.extensions.findIndex((x) => x.item === step.item && x.kind === step.kind);
    const samples: { customer: number; baskets: number[][]; end: number }[] = [];
    if (k >= 1) {
      for (let i = 0; i < proj.sids.length && samples.length < 3; i++) {
        const sid = proj.sids[i];
        if (!readable(sid) || earliestEnd(db[sid], step.pattern) < 0) continue;
        samples.push({ customer: customer(sid), baskets: db[sid], end: proj.ends[i] });
      }
    }

    return {
      pattern: step.pattern,
      item: step.item,
      kind: step.kind,
      support: support(step.pattern),
      holders: holders.length,
      sids: holders,
      hits,
      gsp: gspLevel ? { counted: gspLevel.counted, frequent: gspLevel.frequent } : null,
      vertical: { rows: own.length, customers: new Set(own.map(([sid]) => sid)).size },
      spade,
      prefixspan: {
        prefix,
        projected: proj.sids.length,
        distinct: proj.extensions.length,
        frequent: proj.extensions.filter((x) => x.support >= model.minSupport).length,
        top: proj.extensions.slice(0, 7),
        target: { ...proj.extensions[rank], rank: rank + 1 },
        samples,
      },
    };
  });

  const window = history.slice(-WINDOW);
  const offset = history.length - window.length;
  const pos = latestMatch(window, why.antecedent) ?? [];

  const out: ExplainResponse = {
    ...base,
    item: rec.item,
    rule: {
      antecedent: why.antecedent,
      consequent: rec.item,
      support: why.support,
      antSupport: support(why.antecedent),
      consSupport: support([[rec.item]]),
      confidence: why.confidence,
      lift: why.lift,
      gap: why.gap,
      decay: DECAY,
      score: rec.score,
    },
    matched: pos.map((p) => p + offset),
    chain: steps,
  };
  return Response.json(out);
}
