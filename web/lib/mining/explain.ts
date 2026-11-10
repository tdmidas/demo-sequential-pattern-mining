// "Lần theo một gợi ý": với một luật cụ thể trên dữ liệu thật, tính lại từng con số trung gian
// mà mỗi thuật toán phải đi qua để ra được support của mẫu đứng sau luật đó.
// Mọi thứ ở đây đếm trực tiếp trên CSDL (không dùng kết quả của thuật toán), nên cũng là một phép đối chiếu.

import { type Pattern, type Sequence, iExtend, isSubset, sExtend } from "./types.ts";

export interface ChainStep {
  /** Mẫu sau khi thêm món thứ k. */
  pattern: Pattern;
  /** Món vừa thêm và cách thêm: "s" = thành đơn mới phía sau, "i" = vào cùng đơn cuối. */
  item: number;
  kind: "s" | "i";
  support: number;
}

/** Tách mẫu thành chuỗi các mẫu lớn dần, mỗi bước thêm đúng một món. */
export function patternChain(pattern: Pattern): { pattern: Pattern; item: number; kind: "s" | "i" }[] {
  const out: { pattern: Pattern; item: number; kind: "s" | "i" }[] = [];
  let cur: Pattern = [];
  for (const el of pattern) {
    el.forEach((item, i) => {
      cur = i === 0 ? sExtend(cur, item) : iExtend(cur, item);
      out.push({ pattern: cur, item, kind: i === 0 ? "s" : "i" });
    });
  }
  return out;
}

/** Vị trí đơn sớm nhất mà mẫu khớp xong trong chuỗi (-1 nếu chuỗi không chứa mẫu; mẫu rỗng trả về -1 và coi như khớp). */
export function earliestEnd(seq: Sequence, pattern: Pattern): number {
  let e = -1;
  for (const el of pattern) {
    let found = -1;
    for (let j = e + 1; j < seq.length; j++) {
      if (isSubset(el, seq[j])) {
        found = j;
        break;
      }
    }
    if (found < 0) return -1;
    e = found;
  }
  return e;
}

/** Các đơn của chuỗi khớp với từng phần của mẫu (khớp sớm nhất), hoặc null nếu không chứa. */
export function matchPositions(seq: Sequence, pattern: Pattern): number[] | null {
  const pos: number[] = [];
  let e = -1;
  for (const el of pattern) {
    let found = -1;
    for (let j = e + 1; j < seq.length; j++) {
      if (isSubset(el, seq[j])) {
        found = j;
        break;
      }
    }
    if (found < 0) return null;
    pos.push(found);
    e = found;
  }
  return pos;
}

/** id-list kiểu SPADE của một mẫu: mọi (sid, eid) mà mẫu có thể kết thúc tại đơn eid của chuỗi sid. */
export function idListOf(db: Sequence[], pattern: Pattern): [number, number][] {
  const head = pattern.slice(0, -1);
  const last = pattern[pattern.length - 1];
  const out: [number, number][] = [];
  for (let sid = 0; sid < db.length; sid++) {
    const seq = db[sid];
    const start = head.length ? earliestEnd(seq, head) : -1;
    if (head.length && start < 0) continue;
    for (let e = start + 1; e < seq.length; e++) if (isSubset(last, seq[e])) out.push([sid, e]);
  }
  return out;
}

export interface Extension {
  item: number;
  kind: "s" | "i";
  support: number;
}

/**
 * CSDL chiếu kiểu PrefixSpan theo một tiền tố: những chuỗi chứa tiền tố, vị trí khớp sớm nhất,
 * và support của mọi cách mở rộng thêm một món (đếm trong phần còn lại).
 */
export function projectOn(db: Sequence[], prefix: Pattern, nItems: number): { sids: number[]; ends: number[]; extensions: Extension[] } {
  const sCount = new Int32Array(nItems);
  const iCount = new Int32Array(nItems);
  const sids: number[] = [];
  const ends: number[] = [];
  const last = prefix.length ? prefix[prefix.length - 1] : null;
  const lastMax = last ? last[last.length - 1] : -1;
  for (let sid = 0; sid < db.length; sid++) {
    const seq = db[sid];
    const end = prefix.length ? earliestEnd(seq, prefix) : -1;
    if (prefix.length && end < 0) continue;
    sids.push(sid);
    ends.push(end);
    const seenS = new Set<number>();
    const seenI = new Set<number>();
    for (let e = end + 1; e < seq.length; e++) for (const x of seq[e]) seenS.add(x);
    if (last) {
      for (let e = end; e < seq.length; e++) {
        if (e > end && !isSubset(last, seq[e])) continue;
        for (const x of seq[e]) if (x > lastMax) seenI.add(x);
      }
    }
    for (const x of seenS) sCount[x]++;
    for (const x of seenI) iCount[x]++;
  }
  const extensions: Extension[] = [];
  for (let x = 0; x < nItems; x++) {
    if (sCount[x]) extensions.push({ item: x, kind: "s", support: sCount[x] });
    if (iCount[x]) extensions.push({ item: x, kind: "i", support: iCount[x] });
  }
  extensions.sort((a, b) => b.support - a.support);
  return { sids, ends, extensions };
}

/**
 * Hai mẫu mà SPADE ghép lại để được bước thứ k của chuỗi (k tính từ 0, k >= 1):
 * A là mẫu của bước trước, B là mẫu "anh em" cùng tiền tố với A.
 */
export function spadeParents(chain: { pattern: Pattern; item: number; kind: "s" | "i" }[], k: number): { a: Pattern; b: Pattern; join: "temporal" | "equality" } {
  const a = chain[k - 1].pattern;
  const root: Pattern = k >= 2 ? chain[k - 2].pattern : [];
  const { item, kind } = chain[k];
  if (kind === "s") return { a, b: sExtend(root, item), join: "temporal" };
  const siblingKind = chain[k - 1].kind;
  const b = root.length === 0 || siblingKind === "s" ? sExtend(root, item) : iExtend(root, item);
  return { a, b, join: "equality" };
}
