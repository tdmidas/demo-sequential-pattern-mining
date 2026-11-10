// SPADE (Sequential PAttern Discovery using Equivalence classes) - Zaki, 2001.
// Dữ liệu dạng dọc: mỗi mẫu giữ một id-list gồm các cặp (sid, eid) = (chuỗi, vị trí giỏ hàng kết thúc).
// Support của mẫu dài k+1 tính bằng cách JOIN id-list của hai mẫu dài k cùng lớp tương đương
// (cùng tiền tố), không cần quét lại CSDL gốc.
//   - equality join : cùng (sid, eid)            ->  thêm item vào itemset cuối
//   - temporal join : cùng sid, eid_B > eid_A    ->  thêm item thành itemset mới phía sau
// Điểm yếu lý thuyết: id-list chiếm nhiều bộ nhớ trên dữ liệu dày, và vẫn phải thử (join) rất nhiều cặp.

import {
  type MineOptions,
  type MineResult,
  type Pattern,
  type Sequence,
  bumpLevel,
  emptyStats,
  iExtend,
  keyOf,
  sExtend,
} from "./types.ts";

interface Atom {
  item: number;
  /** "S": item là itemset mới sau tiền tố; "I": item nằm chung itemset cuối của tiền tố. */
  kind: "S" | "I";
  pattern: Pattern;
  sid: Int32Array;
  eid: Int32Array;
  support: number;
}

interface IdList {
  sid: Int32Array;
  eid: Int32Array;
  support: number;
}

function equalityJoin(a: Atom, b: Atom): IdList {
  const n = Math.min(a.sid.length, b.sid.length);
  const sid = new Int32Array(n);
  const eid = new Int32Array(n);
  let i = 0;
  let j = 0;
  let m = 0;
  let support = 0;
  let lastSid = -1;
  while (i < a.sid.length && j < b.sid.length) {
    const ds = a.sid[i] - b.sid[j] || a.eid[i] - b.eid[j];
    if (ds === 0) {
      sid[m] = a.sid[i];
      eid[m] = a.eid[i];
      m++;
      if (a.sid[i] !== lastSid) {
        lastSid = a.sid[i];
        support++;
      }
      i++;
      j++;
    } else if (ds < 0) i++;
    else j++;
  }
  return { sid: sid.subarray(0, m), eid: eid.subarray(0, m), support };
}

/** Giữ các (sid, eid) của B xuất hiện SAU lần xuất hiện sớm nhất của A trong cùng chuỗi. */
function temporalJoin(a: Atom, b: Atom): IdList {
  const sid = new Int32Array(b.sid.length);
  const eid = new Int32Array(b.sid.length);
  let i = 0;
  let j = 0;
  let m = 0;
  let support = 0;
  while (i < a.sid.length && j < b.sid.length) {
    const sa = a.sid[i];
    const sb = b.sid[j];
    if (sa < sb) {
      i++;
      continue;
    }
    if (sb < sa) {
      j++;
      continue;
    }
    const firstA = a.eid[i]; // id-list đã sắp theo (sid, eid) nên đây là eid nhỏ nhất của A
    let any = false;
    while (j < b.sid.length && b.sid[j] === sa) {
      if (b.eid[j] > firstA) {
        sid[m] = sa;
        eid[m] = b.eid[j];
        m++;
        any = true;
      }
      j++;
    }
    if (any) support++;
    while (i < a.sid.length && a.sid[i] === sa) i++;
  }
  return { sid: sid.subarray(0, m), eid: eid.subarray(0, m), support };
}

function pairs(l: IdList): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < l.sid.length; i++) out.push([l.sid[i], l.eid[i]]);
  return out;
}

export function spade(sequences: Sequence[], opts: MineOptions): MineResult {
  const { minSupport, maxLength, nItems, trace } = opts;
  const started = performance.now();
  const deadline = started + (opts.timeBudgetMs ?? Infinity);
  const stats = emptyStats("spade");
  const patterns = new Map<string, number>();

  // ---- Một lần quét: chuyển CSDL sang dạng dọc ------------------------------
  const sidBuf: number[][] = Array.from({ length: nItems }, () => []);
  const eidBuf: number[][] = Array.from({ length: nItems }, () => []);
  for (let s = 0; s < sequences.length; s++) {
    const seq = sequences[s];
    for (let e = 0; e < seq.length; e++) {
      for (const item of seq[e]) {
        sidBuf[item].push(s);
        eidBuf[item].push(e);
      }
    }
  }
  stats.dbScans = 1;

  const roots: Atom[] = [];
  let seen1 = 0;
  for (let item = 0; item < nItems; item++) {
    const sids = sidBuf[item];
    if (sids.length === 0) continue;
    seen1++;
    let support = 0;
    for (let i = 0; i < sids.length; i++) if (i === 0 || sids[i] !== sids[i - 1]) support++;
    const ok = support >= minSupport;
    const atom: Atom = {
      item,
      kind: "S",
      pattern: [[item]],
      sid: Int32Array.from(sids),
      eid: Int32Array.from(eidBuf[item]),
      support,
    };
    trace?.({ type: "spade-vertical", item, idlist: pairs(atom), support, frequent: ok });
    if (ok) {
      roots.push(atom);
      patterns.set(String(item), support);
      stats.totalEntries += sids.length;
    }
  }
  stats.generated += seen1;
  stats.counted += seen1;
  bumpLevel(stats.levels, 1, seen1, roots.length);

  let alive = 0;
  const addAlive = (atoms: Atom[]) => {
    for (const a of atoms) alive += a.sid.length;
    if (alive > stats.peakEntries) stats.peakEntries = alive;
  };
  const dropAlive = (atoms: Atom[]) => {
    for (const a of atoms) alive -= a.sid.length;
  };

  // ---- Duyệt theo chiều sâu trên từng lớp tương đương ------------------------
  const enumerate = (atoms: Atom[], k: number): void => {
    // atoms: các mẫu dài k-1 cùng tiền tố; sinh các mẫu dài k
    if (k > maxLength) return;
    for (const a of atoms) {
      if (stats.timedOut) return;
      if (performance.now() > deadline) {
        stats.timedOut = true;
        return;
      }
      const children: Atom[] = [];
      let joins = 0;
      const tryJoin = (b: Atom, kind: "equality" | "temporal") => {
        joins++;
        stats.ops += a.sid.length + b.sid.length;
        const list = kind === "equality" ? equalityJoin(a, b) : temporalJoin(a, b);
        const ok = list.support >= minSupport;
        const pattern = kind === "equality" ? iExtend(a.pattern, b.item) : sExtend(a.pattern, b.item);
        trace?.({
          type: "spade-join",
          a: a.pattern,
          b: b.pattern,
          kind,
          result: pattern,
          idlist: pairs(list),
          support: list.support,
          frequent: ok,
        });
        if (!ok) return;
        children.push({
          item: b.item,
          kind: kind === "equality" ? "I" : "S",
          pattern,
          sid: list.sid.slice(),
          eid: list.eid.slice(),
          support: list.support,
        });
        patterns.set(keyOf(pattern), list.support);
      };

      for (const b of atoms) {
        if (a.kind === "I") {
          if (b.kind === "I") {
            if (b.item > a.item) tryJoin(b, "equality");
          } else tryJoin(b, "temporal");
        } else if (b.kind === "S") {
          if (b.item > a.item) tryJoin(b, "equality");
          tryJoin(b, "temporal");
        }
      }
      stats.structures += joins;
      stats.generated += joins;
      stats.counted += joins;
      bumpLevel(stats.levels, k, joins, children.length);
      for (const c of children) stats.totalEntries += c.sid.length;

      if (children.length > 0 && k < maxLength) {
        addAlive(children);
        enumerate(children, k + 1);
        dropAlive(children);
      } else {
        // các id-list con vẫn tồn tại cho tới khi rời vòng lặp này
        addAlive(children);
        dropAlive(children);
      }
    }
  };

  addAlive(roots);
  enumerate(roots, 2);

  stats.patterns = patterns.size;
  stats.timeMs = performance.now() - started;
  return { patterns, stats };
}
