// GSP (Generalized Sequential Patterns) - Srikant & Agrawal, 1996.
// Tiếp cận kiểu Apriori trên dữ liệu dạng ngang:
//   lặp theo mức k:  sinh ứng viên C_k từ F_{k-1} (join)  ->  tỉa (prune)  ->  quét CSDL đếm support.
// Điểm yếu lý thuyết: mỗi mức phải quét lại toàn bộ CSDL và số ứng viên bùng nổ khi minsup thấp
// (riêng C_2 đã có |F1|^2 + |F1|(|F1|-1)/2 ứng viên).

import {
  type MineOptions,
  type MineResult,
  type Pattern,
  type Sequence,
  bumpLevel,
  emptyStats,
  indexDb,
  keyOf,
  patternLength,
} from "./types.ts";

function dropFirst(p: Pattern): Pattern {
  if (p[0].length === 1) return p.slice(1);
  return [p[0].slice(1), ...p.slice(1)];
}

function dropLast(p: Pattern): Pattern {
  const last = p[p.length - 1];
  if (last.length === 1) return p.slice(0, -1);
  return [...p.slice(0, -1), last.slice(0, -1)];
}

/** Mọi chuỗi con (k-1) thu được bằng cách bỏ đúng một item. */
function* subsequencesMinusOne(p: Pattern): Generator<Pattern> {
  for (let e = 0; e < p.length; e++) {
    for (let i = 0; i < p[e].length; i++) {
      if (p[e].length === 1) yield [...p.slice(0, e), ...p.slice(e + 1)];
      else yield [...p.slice(0, e), p[e].filter((_, j) => j !== i), ...p.slice(e + 1)];
    }
  }
}

export function gsp(sequences: Sequence[], opts: MineOptions): MineResult {
  const { minSupport, maxLength, nItems, trace } = opts;
  const started = performance.now();
  const deadline = started + (opts.timeBudgetMs ?? Infinity);
  const stats = emptyStats("gsp");
  const patterns = new Map<string, number>();
  const db = indexDb(sequences, nItems);
  const { offset, basketHas } = db;

  // Bitmap "chuỗi có chứa item" để loại nhanh ứng viên không thể khớp.
  const seqHas = new Uint8Array(sequences.length * nItems);

  // ---- Mức 1: quét CSDL lần đầu, đếm support từng item ----------------------
  const itemSupport = new Int32Array(nItems);
  for (let s = 0; s < sequences.length; s++) {
    const base = s * nItems;
    for (const el of sequences[s]) {
      for (const item of el) {
        if (!seqHas[base + item]) {
          seqHas[base + item] = 1;
          itemSupport[item]++;
        }
      }
    }
  }
  stats.dbScans = 1;
  let frequent: Pattern[] = [];
  const level1: { pattern: Pattern; support: number; frequent: boolean }[] = [];
  let seen1 = 0;
  for (let item = 0; item < nItems; item++) {
    if (itemSupport[item] === 0) continue;
    seen1++;
    const ok = itemSupport[item] >= minSupport;
    if (trace) level1.push({ pattern: [[item]], support: itemSupport[item], frequent: ok });
    if (ok) {
      frequent.push([[item]]);
      patterns.set(String(item), itemSupport[item]);
    }
  }
  stats.generated += seen1;
  stats.counted += seen1;
  bumpLevel(stats.levels, 1, seen1, frequent.length);
  trace?.({ type: "gsp-level", k: 1, generated: level1.map((c) => c.pattern), pruned: [], counted: level1 });

  // ---- Mức k >= 2 -----------------------------------------------------------
  for (let k = 2; k <= maxLength && frequent.length > 0; k++) {
    // (1) Sinh ứng viên
    let generated: Pattern[] = [];
    if (k === 2) {
      const f1 = frequent.map((p) => p[0][0]);
      for (const x of f1) for (const y of f1) generated.push([[x], [y]]);
      for (let i = 0; i < f1.length; i++) for (let j = i + 1; j < f1.length; j++) generated.push([[f1[i], f1[j]]]);
    } else {
      // s1 nối được với s2 nếu (s1 bỏ item đầu) == (s2 bỏ item cuối)
      const byPrefix = new Map<string, Pattern[]>();
      for (const s2 of frequent) {
        const key = keyOf(dropLast(s2));
        const list = byPrefix.get(key);
        if (list) list.push(s2);
        else byPrefix.set(key, [s2]);
      }
      for (const s1 of frequent) {
        const partners = byPrefix.get(keyOf(dropFirst(s1)));
        if (!partners) continue;
        for (const s2 of partners) {
          const lastEl = s2[s2.length - 1];
          const item = lastEl[lastEl.length - 1];
          if (lastEl.length === 1) generated.push([...s1, [item]]);
          else generated.push([...s1.slice(0, -1), [...s1[s1.length - 1], item]]);
        }
      }
    }
    stats.generated += generated.length;

    // (2) Tỉa: mọi chuỗi con (k-1) phải phổ biến (tính chất Apriori)
    let candidates: Pattern[];
    const pruned: Pattern[] = [];
    if (k === 2) {
      candidates = generated;
    } else {
      candidates = [];
      for (const c of generated) {
        let ok = true;
        for (const sub of subsequencesMinusOne(c)) {
          if (!patterns.has(keyOf(sub))) {
            ok = false;
            break;
          }
        }
        if (ok) candidates.push(c);
        else if (trace) pruned.push(c);
      }
    }
    generated = [];
    if (candidates.length === 0) {
      trace?.({ type: "gsp-level", k, generated: pruned, pruned, counted: [] });
      break;
    }

    let candItems = 0;
    for (const c of candidates) candItems += patternLength(c);
    stats.totalEntries += candItems;
    if (candItems > stats.peakEntries) stats.peakEntries = candItems;

    // (3) Quét CSDL đếm support của mọi ứng viên
    const support = new Int32Array(candidates.length);
    // Gom ứng viên theo item đầu tiên (đóng vai trò cây băm 1 tầng của GSP gốc):
    // với mỗi chuỗi chỉ cần xét các ứng viên bắt đầu bằng một item có trong chuỗi đó.
    const flatAll = candidates.map((c, idx) => ({ idx, els: c, items: c.flat() }));
    const byFirst: (typeof flatAll)[] = Array.from({ length: nItems }, () => []);
    for (const f of flatAll) byFirst[f.items[0]].push(f);
    const seqItems: number[] = [];
    stats.dbScans++;
    for (let s = 0; s < sequences.length; s++) {
      if ((s & 15) === 0 && performance.now() > deadline) {
        stats.timedOut = true;
        break;
      }
      const seqLen = sequences[s].length;
      const sBase = s * nItems;
      const bBase = offset[s];
      seqItems.length = 0;
      for (let item = 0; item < nItems; item++) if (seqHas[sBase + item]) seqItems.push(item);
      for (let q = 0; q < seqItems.length; q++) {
       const flat = byFirst[seqItems[q]];
       for (let f = 0; f < flat.length; f++) {
        const { els, items, idx: c } = flat[f];
        stats.ops++;
        let possible = true;
        for (let i = 0; i < items.length; i++) {
          if (!seqHas[sBase + items[i]]) {
            possible = false;
            break;
          }
        }
        if (!possible) continue;
        let e = 0;
        let matched = 0;
        for (; matched < els.length; matched++) {
          const el = els[matched];
          let found = false;
          for (; e < seqLen; e++) {
            const row = (bBase + e) * nItems;
            let all = true;
            for (let i = 0; i < el.length; i++) {
              if (!basketHas[row + el[i]]) {
                all = false;
                break;
              }
            }
            if (all) {
              found = true;
              e++;
              break;
            }
          }
          if (!found) break;
        }
        if (matched === els.length) support[c]++;
       }
      }
    }
    stats.counted += candidates.length;
    if (stats.timedOut) {
      bumpLevel(stats.levels, k, candidates.length, 0);
      break;
    }

    const next: Pattern[] = [];
    const counted: { pattern: Pattern; support: number; frequent: boolean }[] = [];
    for (let c = 0; c < candidates.length; c++) {
      const ok = support[c] >= minSupport;
      if (trace) counted.push({ pattern: candidates[c], support: support[c], frequent: ok });
      if (ok) {
        next.push(candidates[c]);
        patterns.set(keyOf(candidates[c]), support[c]);
      }
    }
    bumpLevel(stats.levels, k, candidates.length, next.length);
    trace?.({ type: "gsp-level", k, generated: [...candidates, ...pruned], pruned, counted });
    frequent = next;
  }

  stats.structures = stats.levels.length;
  stats.patterns = patterns.size;
  stats.timeMs = performance.now() - started;
  return { patterns, stats };
}
