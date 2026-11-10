// Kiểm chứng tính đúng đắn của 3 thuật toán. Chạy:  npm run verify
//
//  A. Ba thuật toán cho CÙNG tập mẫu và CÙNG support.
//  B. Đúng (soundness): support của mẫu tìm được khớp với cách đếm trực tiếp trên CSDL.
//  C. Đủ (completeness): trên CSDL nhỏ, so với việc liệt kê vét cạn MỌI mẫu có thể có.
//  D. Luật: support / confidence của luật khớp với đếm trực tiếp.
//  E. (tuỳ chọn) So với thư viện SPMF nếu có file kết quả:  node scripts/verify.ts --spmf <file output của SPMF> <minsup%> <maxLen>

import { readFileSync } from "node:fs";
import {
  ALGORITHMS,
  TOY_DB,
  buildRules,
  containsPattern,
  keyOf,
  mine,
  parseKey,
  patternLength,
  type Pattern,
  type Sequence,
} from "../lib/mining/index.ts";

let failed = false;
const report = (ok: boolean, text: string) => {
  if (!ok) failed = true;
  console.log(`${ok ? "OK  " : "FAIL"} ${text}`);
};

const directSupport = (db: Sequence[], p: Pattern) => db.reduce((n, s) => n + (containsPattern(s, p) ? 1 : 0), 0);

function sameMaps(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

/** Vét cạn: sinh mọi mẫu đến độ dài maxLength bằng cách mở rộng không tỉa theo thuật toán nào, đếm trực tiếp. */
function bruteForce(db: Sequence[], nItems: number, minSupport: number, maxLength: number): Map<string, number> {
  const out = new Map<string, number>();
  const grow = (p: Pattern) => {
    if (patternLength(p) >= maxLength) return;
    const last = p[p.length - 1];
    const next: Pattern[] = [];
    for (let x = 0; x < nItems; x++) {
      next.push([...p, [x]]);
      if (last && x > last[last.length - 1]) next.push([...p.slice(0, -1), [...last, x]]);
    }
    for (const q of next) {
      const sup = directSupport(db, q);
      if (sup >= minSupport) {
        out.set(keyOf(q), sup);
        grow(q); // chỉ dùng tính phản đơn điệu của support, đúng với mọi thuật toán
      }
    }
  };
  grow([]);
  return out;
}

function randomDb(seed: number, nSeq: number, nItems: number): Sequence[] {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: nSeq }, () =>
    Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => {
      const set = new Set<number>();
      const size = 1 + Math.floor(rnd() * 3);
      while (set.size < size) set.add(Math.floor(rnd() * nItems));
      return [...set].sort((a, b) => a - b);
    }),
  );
}

function checkSmall(name: string, db: Sequence[], nItems: number, minSupport: number, maxLength: number) {
  const truth = bruteForce(db, nItems, minSupport, maxLength);
  const results = ALGORITHMS.map((a) => mine(a.id, db, { minSupport, maxLength, nItems }));
  const ok = results.every((r) => sameMaps(r.patterns, truth));
  report(ok, `${name}: minsup=${minSupport} maxLen=${maxLength} -> ${truth.size} mẫu (vét cạn) | ` + results.map((r) => `${r.stats.algorithm}=${r.patterns.size}`).join(" "));
}

// ---- C. CSDL nhỏ: đủ và đúng so với vét cạn ---------------------------------
console.log("== CSDL minh hoạ (bài báo PrefixSpan nêu 53 mẫu ở minsup 2) ==");
checkSmall("toy", TOY_DB, 7, 2, 9);
checkSmall("toy", TOY_DB, 7, 3, 9);
checkSmall("toy", TOY_DB, 7, 1, 4);
console.log("== 40 CSDL ngẫu nhiên ==");
let randomOk = 0;
for (let seed = 1; seed <= 40; seed++) {
  const db = randomDb(seed, 12 + (seed % 9), 5 + (seed % 4));
  const minSupport = 2 + (seed % 3);
  const truth = bruteForce(db, 9, minSupport, 4);
  const good = ALGORITHMS.every((a) => sameMaps(mine(a.id, db, { minSupport, maxLength: 4, nItems: 9 }).patterns, truth));
  if (good) randomOk++;
  else console.log(`  seed ${seed} sai`);
}
report(randomOk === 40, `ngẫu nhiên: ${randomOk}/40 CSDL, cả 3 thuật toán trùng với vét cạn`);

// ---- A, B, D. Dữ liệu thật ---------------------------------------------------
console.log("== Dữ liệu Online Retail II ==");
const customers: { baskets: { items: number[] }[] }[] = JSON.parse(readFileSync(new URL("../data/customers.json", import.meta.url), "utf8"));
const db = customers.map((c) => c.baskets.slice(0, -1).map((b) => b.items));
const N = db.length;

for (const [pct, maxLength] of [[10, 5], [5, 3], [4, 4], [3, 3]] as const) {
  const minSupport = Math.ceil((pct / 100) * N);
  const results = ALGORITHMS.map((a) => mine(a.id, db, { minSupport, maxLength, nItems: 300 }));
  const agree = results.every((r) => sameMaps(r.patterns, results[0].patterns));
  // B: đếm trực tiếp một mẫu ngẫu nhiên cách đều trong tập kết quả
  const keys = [...results[0].patterns.keys()];
  const step = Math.max(1, Math.floor(keys.length / 200));
  let checked = 0;
  let wrong = 0;
  for (let i = 0; i < keys.length; i += step) {
    checked++;
    if (directSupport(db, parseKey(keys[i])) !== results[0].patterns.get(keys[i])) wrong++;
  }
  // Tính đủ ở mức 2: mọi cặp <x y>, <(x y)> đạt minsup đều phải có mặt
  let missing = 0;
  if (pct >= 5) {
    const f1 = keys.filter((k) => !k.includes("|") && !k.includes(",")).map(Number);
    for (const x of f1.slice(0, 60)) {
      for (const y of f1.slice(0, 60)) {
        for (const p of [[[x], [y]], ...(x < y ? [[[x, y]]] : [])] as Pattern[]) {
          if (directSupport(db, p) >= minSupport && !results[0].patterns.has(keyOf(p))) missing++;
        }
      }
    }
  }
  report(
    agree && wrong === 0 && missing === 0,
    `minsup ${pct}% (${minSupport}) maxLen ${maxLength}: ${keys.length} mẫu | 3 thuật toán trùng nhau: ${agree} | đếm lại ${checked} mẫu, sai ${wrong}` +
      (pct >= 5 ? ` | thiếu mẫu dài 2 (thử 60x60 item): ${missing}` : ""),
  );

  if (pct === 3) {
    const rules = buildRules(results[0].patterns, N);
    let bad = 0;
    const rstep = Math.max(1, Math.floor(rules.length / 150));
    let rchecked = 0;
    for (let i = 0; i < rules.length; i += rstep) {
      const r = rules[i];
      rchecked++;
      const supAnt = directSupport(db, r.antecedent);
      const supAll = directSupport(db, [...r.antecedent, [r.consequent]]);
      const supCons = directSupport(db, [[r.consequent]]);
      const conf = supAll / supAnt;
      if (supAll !== r.support || Math.abs(conf - r.confidence) > 1e-12 || Math.abs(conf / (supCons / N) - r.lift) > 1e-9) bad++;
    }
    report(bad === 0, `luật tuần tự: ${rules.length} luật, tính lại support/confidence/lift cho ${rchecked} luật, sai ${bad}`);
  }
}

// ---- E. So với SPMF -----------------------------------------------------------
const at = process.argv.indexOf("--spmf");
if (at > 0) {
  const [file, pct, maxLen] = [process.argv[at + 1], Number(process.argv[at + 2]), Number(process.argv[at + 3])];
  const spmf = new Map<string, number>();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^(.*?)\s*#SUP:\s*(\d+)/);
    if (!m) continue;
    const p = m[1]
      .split("-1")
      .map((el) => el.trim().split(/\s+/).filter(Boolean).map(Number).sort((a, b) => a - b))
      .filter((el) => el.length);
    spmf.set(keyOf(p), Number(m[2]));
  }
  const ours = mine("prefixspan", db, { minSupport: Math.ceil((pct / 100) * N), maxLength: maxLen, nItems: 300 }).patterns;
  report(sameMaps(ours, spmf), `so với SPMF (minsup ${pct}%, maxLen ${maxLen}): SPMF ${spmf.size} mẫu, của ta ${ours.size} mẫu`);
}

console.log(failed ? "\nCÓ LỖI" : "\nTất cả kiểm tra đều đạt.");
if (failed) process.exitCode = 1;
