// PrefixSpan (Prefix-projected Sequential pattern mining) - Pei et al., 2001.
// Pattern-growth: không sinh ứng viên. Với mỗi tiền tố phổ biến, chỉ xét phần hậu tố của các chuỗi
// chứa tiền tố đó ("CSDL chiếu"), đếm item cục bộ rồi mở rộng tiền tố và đệ quy.
// Ở đây dùng pseudo-projection: CSDL chiếu chỉ là danh sách con trỏ (sid, vị trí giỏ khớp sớm nhất),
// không sao chép dữ liệu.
// Điểm yếu lý thuyết: số CSDL chiếu bằng số mẫu phổ biến; trên dữ liệu dày các CSDL chiếu co lại rất chậm
// nên tổng chi phí chiếu lớn.

import {
  type MineOptions,
  type MineResult,
  type Pattern,
  type Sequence,
  bumpLevel,
  emptyStats,
  iExtend,
  indexDb,
  keyOf,
  sExtend,
} from "./types.ts";

interface Bucket {
  sids: number[];
  ends: number[];
}

export function prefixspan(sequences: Sequence[], opts: MineOptions): MineResult {
  const { minSupport, maxLength, nItems, trace } = opts;
  const started = performance.now();
  const deadline = started + (opts.timeBudgetMs ?? Infinity);
  const stats = emptyStats("prefixspan");
  const patterns = new Map<string, number>();
  const { offset, basketHas } = indexDb(sequences, nItems);

  // stamp[item] = lần chiếu gần nhất đã đếm item này cho chuỗi đang xét (tránh đếm trùng trong 1 chuỗi)
  const stampS = new Int32Array(nItems).fill(-1);
  const stampI = new Int32Array(nItems).fill(-1);
  let stamp = 0;
  let alive = 0;
  let tick = 0;

  /**
   * Mở rộng tiền tố `prefix` (dài k-1 item). CSDL chiếu của nó là (sids[i], ends[i]):
   * ends[i] = vị trí giỏ sớm nhất mà itemset cuối của prefix khớp trong chuỗi sids[i]; -1 cho tiền tố rỗng.
   */
  const grow = (prefix: Pattern, sids: number[], ends: number[], k: number): void => {
    if (k > maxLength || stats.timedOut) return;
    if ((++tick & 15) === 0 && performance.now() > deadline) {
      stats.timedOut = true;
      return;
    }
    const last = prefix.length ? prefix[prefix.length - 1] : null;
    const lastMax = last ? last[last.length - 1] : -1;
    const sBuckets = new Map<number, Bucket>();
    const iBuckets = new Map<number, Bucket>();
    let created = 0;

    for (let p = 0; p < sids.length; p++) {
      const sid = sids[p];
      const end = ends[p];
      const seq = sequences[sid];
      stamp++;
      // i-extension: item > item lớn nhất của itemset cuối, nằm trong một giỏ (từ `end` trở đi) chứa trọn itemset cuối
      if (last) {
        for (let e = end; e < seq.length; e++) {
          if (e > end) {
            const row = (offset[sid] + e) * nItems;
            let all = true;
            for (let i = 0; i < last.length; i++) {
              if (!basketHas[row + last[i]]) {
                all = false;
                break;
              }
            }
            if (!all) continue;
          }
          const el = seq[e];
          for (let i = el.length - 1; i >= 0 && el[i] > lastMax; i--) {
            stats.ops++;
            const item = el[i];
            if (stampI[item] === stamp) continue;
            stampI[item] = stamp;
            let b = iBuckets.get(item);
            if (!b) iBuckets.set(item, (b = { sids: [], ends: [] }));
            b.sids.push(sid);
            b.ends.push(e);
            created++;
          }
        }
      }
      // s-extension: mọi item trong các giỏ đứng sau `end`
      for (let e = end + 1; e < seq.length; e++) {
        const el = seq[e];
        for (let i = 0; i < el.length; i++) {
          stats.ops++;
          const item = el[i];
          if (stampS[item] === stamp) continue;
          stampS[item] = stamp;
          let b = sBuckets.get(item);
          if (!b) sBuckets.set(item, (b = { sids: [], ends: [] }));
          b.sids.push(sid);
          b.ends.push(e);
          created++;
        }
      }
    }

    const counted = sBuckets.size + iBuckets.size;
    stats.generated += counted;
    stats.counted += counted;
    alive += created;
    if (alive > stats.peakEntries) stats.peakEntries = alive;

    if (trace && prefix.length) {
      const ext: { item: number; kind: "s" | "i"; support: number; frequent: boolean }[] = [];
      for (const [item, b] of iBuckets) ext.push({ item, kind: "i", support: b.sids.length, frequent: b.sids.length >= minSupport });
      for (const [item, b] of sBuckets) ext.push({ item, kind: "s", support: b.sids.length, frequent: b.sids.length >= minSupport });
      ext.sort((x, y) => (x.kind === y.kind ? x.item - y.item : x.kind < y.kind ? -1 : 1));
      trace({
        type: "prefixspan-project",
        prefix,
        support: sids.length,
        projected: sids.map((sid, i) => {
          const rest = sequences[sid][ends[i]].filter((x) => x > lastMax);
          return { sid, from: ends[i], partial: rest.length ? rest : null };
        }),
        extensions: ext,
      });
    }

    let frequentHere = 0;
    const visit = (buckets: Map<number, Bucket>, kind: "s" | "i") => {
      const items = [...buckets.keys()].sort((a, b) => a - b);
      for (const item of items) {
        const b = buckets.get(item)!;
        if (b.sids.length < minSupport) continue;
        frequentHere++;
        const next = kind === "s" ? sExtend(prefix, item) : iExtend(prefix, item);
        patterns.set(keyOf(next), b.sids.length);
        stats.structures++;
        stats.totalEntries += b.sids.length;
        grow(next, b.sids, b.ends, k + 1);
      }
    };
    visit(iBuckets, "i");
    visit(sBuckets, "s");
    bumpLevel(stats.levels, k, counted, frequentHere);
    alive -= created;
  };

  // Tiền tố rỗng: CSDL chiếu là toàn bộ CSDL (lần quét duy nhất trên dữ liệu gốc)
  stats.dbScans = 1;
  const allSids = sequences.map((_, i) => i);
  const allEnds = sequences.map(() => -1);
  grow([], allSids, allEnds, 1);

  stats.patterns = patterns.size;
  stats.timeMs = performance.now() - started;
  return { patterns, stats };
}
