// Biến vết chạy (trace) của thuật toán thật thành các "khung hình" để trang Minh hoạ phát lần lượt.
// Mỗi khung hình là một việc nhỏ mà người xem theo dõi được bằng mắt.

import {
  type AlgorithmId,
  type Pattern,
  type Rule,
  type Sequence,
  type TraceEvent,
  buildRules,
  containsPattern,
  keyOf,
  mine,
} from "@/lib/mining";

export type IdList = [number, number][];

export interface Found {
  pattern: Pattern;
  support: number;
}

export type Scene =
  | { kind: "data" }
  | { kind: "gsp-gen"; k: number; candidates: Pattern[]; pruned: Pattern[] }
  | { kind: "gsp-scan"; k: number; candidates: Pattern[]; sid: number; counts: number[]; hit: boolean[] }
  | { kind: "gsp-result"; k: number; candidates: Pattern[]; counts: number[]; frequent: boolean[] }
  | { kind: "spade-vertical"; lists: { item: number; idlist: IdList; support: number; frequent: boolean }[] }
  | {
      kind: "spade-join";
      a: Pattern;
      b: Pattern;
      aList: IdList;
      bList: IdList;
      join: "equality" | "temporal";
      result: Pattern;
      idlist: IdList;
      support: number;
      frequent: boolean;
    }
  | { kind: "ps-root"; counts: { item: number; support: number; frequent: boolean }[] }
  | {
      kind: "ps-project";
      prefix: Pattern;
      projected: { sid: number; from: number; partial: number[] | null }[];
      extensions: { item: number; kind: "s" | "i"; support: number; frequent: boolean; result: Pattern }[];
    }
  | { kind: "mined" }
  | { kind: "rules" }
  | { kind: "recommend" };

export interface Frame {
  /** 1 = dữ liệu, 2 = khai thác mẫu, 3 = sinh luật, 4 = gợi ý. */
  stage: 1 | 2 | 3 | 4;
  title: string;
  scene: Scene;
  /** Số mẫu phổ biến đã tìm được tính đến hết khung hình này. */
  foundCount: number;
  /** Số mẫu mới xuất hiện ở đúng khung hình này (để làm nổi). */
  fresh: number;
}

export interface Story {
  frames: Frame[];
  found: Found[];
  rules: Rule[];
  patterns: Map<string, number>;
  stats: { counted: number; dbScans: number };
}

export function buildStory(algorithm: AlgorithmId, db: Sequence[], nItems: number, minSupport: number, show: (p: Pattern) => string): Story {
  const events: TraceEvent[] = [];
  const result = mine(algorithm, db, { minSupport, maxLength: 8, nItems, trace: (e) => events.push(e) });
  const frames: Frame[] = [];
  const found: Found[] = [];
  const push = (stage: Frame["stage"], title: string, scene: Scene, add: Found[] = []) => {
    found.push(...add);
    frames.push({ stage, title, scene, foundCount: found.length, fresh: add.length });
  };

  push(1, "Dữ liệu đầu vào", { kind: "data" });

  if (algorithm === "gsp") {
    for (const e of events) {
      if (e.type !== "gsp-level") continue;
      const candidates = e.counted.map((c) => c.pattern);
      if (candidates.length === 0 && e.pruned.length === 0) continue;
      push(2, `Mức ${e.k}: lập danh sách ứng viên`, { kind: "gsp-gen", k: e.k, candidates, pruned: e.pruned });
      if (candidates.length === 0) continue;
      const counts = candidates.map(() => 0);
      db.forEach((seq, sid) => {
        const hit = candidates.map((c) => containsPattern(seq, c));
        hit.forEach((h, i) => h && counts[i]++);
        push(2, `Mức ${e.k}: quét khách K${sid + 1}`, { kind: "gsp-scan", k: e.k, candidates, sid, counts: [...counts], hit });
      });
      const frequent = e.counted.map((c) => c.frequent);
      push(
        2,
        `Mức ${e.k}: giữ lại ứng viên đạt minsup`,
        { kind: "gsp-result", k: e.k, candidates, counts: [...counts], frequent },
        e.counted.filter((c) => c.frequent).map((c) => ({ pattern: c.pattern, support: c.support })),
      );
    }
  } else if (algorithm === "spade") {
    const lists = new Map<string, IdList>();
    const vertical = events.filter((e) => e.type === "spade-vertical");
    for (const e of vertical) lists.set(keyOf([[e.item]]), e.idlist);
    push(
      2,
      "Lật dữ liệu sang dạng dọc",
      { kind: "spade-vertical", lists: vertical.map((e) => ({ item: e.item, idlist: e.idlist, support: e.support, frequent: e.frequent })) },
      vertical.filter((e) => e.frequent).map((e) => ({ pattern: [[e.item]], support: e.support })),
    );
    for (const e of events) {
      if (e.type !== "spade-join") continue;
      lists.set(keyOf(e.result), e.idlist);
      push(
        2,
        `Ghép ${show(e.a)} với ${show(e.b)}`,
        {
          kind: "spade-join",
          a: e.a,
          b: e.b,
          aList: lists.get(keyOf(e.a)) ?? [],
          bList: lists.get(keyOf(e.b)) ?? [],
          join: e.kind,
          result: e.result,
          idlist: e.idlist,
          support: e.support,
          frequent: e.frequent,
        },
        e.frequent ? [{ pattern: e.result, support: e.support }] : [],
      );
    }
  } else {
    const counts = Array.from({ length: nItems }, (_, item) => {
      const support = db.filter((s) => s.some((el) => el.includes(item))).length;
      return { item, support, frequent: support >= minSupport };
    }).filter((c) => c.support > 0);
    push(
      2,
      "Đếm từng món để chọn tiền tố",
      { kind: "ps-root", counts },
      counts.filter((c) => c.frequent).map((c) => ({ pattern: [[c.item]], support: c.support })),
    );
    for (const e of events) {
      if (e.type !== "prefixspan-project") continue;
      const last = e.prefix[e.prefix.length - 1];
      const extensions = e.extensions.map((x) => ({
        ...x,
        result: x.kind === "i" ? [...e.prefix.slice(0, -1), [...last, x.item]] : [...e.prefix, [x.item]],
      }));
      push(
        2,
        `Chiếu theo tiền tố ${show(e.prefix)}`,
        { kind: "ps-project", prefix: e.prefix, projected: e.projected, extensions },
        extensions.filter((x) => x.frequent).map((x) => ({ pattern: x.result, support: x.support })),
      );
    }
  }

  push(2, "Kết quả khai thác", { kind: "mined" });
  push(3, "Từ mẫu sang luật", { kind: "rules" });
  push(4, "Từ luật sang gợi ý", { kind: "recommend" });

  return {
    frames,
    found,
    rules: buildRules(result.patterns, db.length),
    patterns: result.patterns,
    stats: { counted: result.stats.counted, dbScans: result.stats.dbScans },
  };
}
