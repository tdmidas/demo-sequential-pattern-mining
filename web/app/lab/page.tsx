"use client";

import { CircleCheck, Play, TimerOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ALGO_COLOR, ALGO_IDS, ALGO_NAME } from "@/components/charts";
import { useShop } from "@/components/shop-context";
import { Card, CardHeader, Note, PageTitle, PatternView, Segmented, Spinner, Stat, fmt, fmtCompact, fmtMs, pct } from "@/components/ui";
import type { Item } from "@/lib/data";
import type { Rule } from "@/lib/mining/rules";
import type { AlgorithmId, MineStats } from "@/lib/mining/types";

interface MineResponse {
  algorithm: AlgorithmId;
  minsupPct: number;
  maxLength: number;
  minSupport: number;
  sequences: number;
  budgetMs: number;
  stats: MineStats;
  byLength: Record<string, { all: number; closed: number; maximal: number }>;
  closedCount: number;
  maximalCount: number;
  patternRows: { p: number[][]; s: number; c: boolean; m: boolean; k: number }[];
  patternRowsTotal: number;
  ruleCount: number;
  rules: Rule[];
}

const ALGO_CARD: Record<AlgorithmId, { family: string; idea: string; counted: string; peak: string }> = {
  gsp: {
    family: "Kiểu Apriori · dữ liệu ngang · 1996",
    idea: "Sinh ứng viên dài k từ mẫu dài k−1, tỉa, rồi quét CSDL để đếm.",
    counted: "Ứng viên phải đếm",
    peak: "item trong tập ứng viên lớn nhất",
  },
  spade: {
    family: "Dữ liệu dọc · id-list · 2001",
    idea: "Mỗi mẫu giữ danh sách (sid, eid). Support tính bằng phép join hai id-list.",
    counted: "Phép join id-list",
    peak: "cặp (sid, eid) giữ cùng lúc",
  },
  prefixspan: {
    family: "Pattern-growth · CSDL chiếu · 2001",
    idea: "Không sinh ứng viên. Chiếu CSDL theo tiền tố rồi đếm item cục bộ.",
    counted: "Mở rộng đếm trong CSDL chiếu",
    peak: "con trỏ chiếu giữ cùng lúc",
  },
};

export default function LabPage() {
  const { catalog } = useShop();
  const [algorithm, setAlgorithm] = useState<AlgorithmId>("prefixspan");
  const [minsupPct, setMinsupPct] = useState(3);
  const [maxLength, setMaxLength] = useState(3);
  const [runs, setRuns] = useState<Partial<Record<AlgorithmId, MineResponse>>>({});
  const [running, setRunning] = useState<AlgorithmId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t0 = performance.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(performance.now() - t0), 100);
    return () => clearInterval(t);
  }, [running]);

  const paramsKey = `${minsupPct}|${maxLength}`;
  const [runsKey, setRunsKey] = useState(paramsKey);
  const current = runsKey === paramsKey ? runs : {};
  const sequences = catalog?.sequences ?? 0;

  async function run(ids: AlgorithmId[], pctOverride?: number) {
    const minsup = pctOverride ?? minsupPct;
    const key = `${minsup}|${maxLength}`;
    if (pctOverride != null) setMinsupPct(pctOverride);
    setError(null);
    let acc = runsKey === key ? { ...runs } : {};
    setRunsKey(key);
    setRuns(acc);
    for (const id of ids) {
      setRunning(id);
      try {
        const r = await fetch("/api/mine", { method: "POST", body: JSON.stringify({ algorithm: id, minsupPct: minsup, maxLength }) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        acc = { ...acc, [id]: await r.json() };
        setRuns(acc);
      } catch (e) {
        setError(String((e as Error).message ?? e));
        break;
      }
    }
    setRunning(null);
  }

  const result = current[algorithm];
  const done = ALGO_IDS.filter((id) => current[id]);
  // tập mẫu đầy đủ để hiển thị: ưu tiên lần chạy không bị quá thời gian
  const complete = result && !result.stats.timedOut ? result : done.map((id) => current[id]!).find((r) => !r.stats.timedOut);

  return (
    <div>
      <PageTitle
        title="Khai thác mẫu tuần tự"
        lead="Chạy trực tiếp ba thuật toán trên CSDL chuỗi mua hàng thật. Cùng tham số thì cả ba cho ra cùng một tập mẫu; khác nhau ở cách tìm, và vì thế khác nhau về thời gian, số lần quét dữ liệu và bộ nhớ."
      />

      <Card className="mb-4">
        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-2 text-xs font-medium text-ink-2">Thuật toán</div>
            <div className="grid gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Thuật toán">
              {ALGO_IDS.map((id) => {
                const on = id === algorithm;
                const r = current[id];
                return (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setAlgorithm(id)}
                    className={`rounded-md border p-3 text-left transition-colors ${
                      on ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-line-strong hover:border-brand-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: ALGO_COLOR[id] }} />
                      <span className="text-sm font-semibold">{ALGO_NAME[id]}</span>
                      {running === id ? (
                        <span className="tabular ml-auto flex items-center gap-1.5 text-xs font-medium text-brand-700">
                          <Spinner className="!h-3.5 !w-3.5" /> {(elapsed / 1000).toFixed(1).replace(".", ",")} s
                        </span>
                      ) : r ? (
                        <span className={`tabular ml-auto text-xs font-medium ${r.stats.timedOut ? "text-bad" : "text-ink-2"}`}>
                          {r.stats.timedOut ? "quá thời gian" : fmtMs(r.stats.timeMs)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[11.5px] text-ink-3">{ALGO_CARD[id].family}</div>
                    <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">{ALGO_CARD[id].idea}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="minsup" className="text-xs font-medium text-ink-2">
                  Ngưỡng support tối thiểu (minsup)
                </label>
                <span className="tabular text-[13px] font-semibold">
                  {String(minsupPct).replace(".", ",")}%{" "}
                  <span className="font-normal text-ink-3">= {fmt(Math.ceil((minsupPct / 100) * sequences))} khách</span>
                </span>
              </div>
              <input
                id="minsup"
                type="range"
                min={1}
                max={12}
                step={0.5}
                value={minsupPct}
                onChange={(e) => setMinsupPct(Number(e.target.value))}
                className="mt-2 w-full"
              />
              <div className="tabular flex justify-between text-[11px] text-ink-3">
                <span>1% · rất nhiều mẫu</span>
                <span>12% · rất ít mẫu</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-2">Số item tối đa trong một mẫu</span>
              <Segmented
                size="sm"
                value={String(maxLength)}
                onChange={(v) => setMaxLength(Number(v))}
                options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => run([algorithm])}
                disabled={!!running}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {running ? <Spinner /> : <Play className="h-4 w-4" />} Chạy {ALGO_NAME[algorithm]}
              </button>
              <button
                onClick={() => run(ALGO_IDS)}
                disabled={!!running}
                className="h-10 rounded-md border border-line-strong px-4 text-sm font-medium hover:border-brand-500 hover:text-brand-700 disabled:opacity-60"
              >
                Chạy cả 3
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ink-2">Kịch bản nhanh:</span>
              <button onClick={() => run(ALGO_IDS, 3)} disabled={!!running} className="rounded-full border border-line-strong px-2.5 py-1 font-medium hover:border-brand-500 hover:text-brand-700 disabled:opacity-60">
                3% · chạy bình thường
              </button>
              <button onClick={() => run(ALGO_IDS, 1.5)} disabled={!!running} className="rounded-full border border-line-strong px-2.5 py-1 font-medium hover:border-brand-500 hover:text-brand-700 disabled:opacity-60">
                1,5% · ép tới giới hạn
              </button>
            </div>
            <p className="text-[11.5px] leading-relaxed text-ink-3">Mỗi lần chạy bị ngắt sau 10 giây để buổi demo không bị treo.</p>
          </div>
        </div>
      </Card>

      {error && <Note tone="warn">Lỗi khi chạy: {error}</Note>}

      {done.length === 0 && !running && (
        <Card className="px-5 py-14 text-center text-sm text-ink-2">
          Chọn thuật toán và tham số rồi bấm <b className="text-ink">Chạy</b>. Để xem nhanh, dùng hai nút <b className="text-ink">Kịch bản nhanh</b>: 3% rồi 1,5%.
        </Card>
      )}
      {done.length === 0 && running && (
        <Card className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-ink-2">
          <Spinner /> {ALGO_NAME[running]} đang chạy trên {fmt(sequences)} chuỗi…
        </Card>
      )}

      {done.length >= 2 && <Comparison runs={done.map((id) => current[id]!)} />}

      {result && (
        <div className="fade-up mb-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ALGO_COLOR[algorithm] }} />
            <h2 className="text-[15px] font-semibold">
              {ALGO_NAME[algorithm]} · minsup {String(result.minsupPct).replace(".", ",")}% ({fmt(result.minSupport)} khách) · tối đa {result.maxLength} item
            </h2>
          </div>
          {result.stats.timedOut && (
            <div className="mb-3">
              <Note tone="warn" title={<span className="flex items-center gap-1.5"><TimerOff className="h-4 w-4" /> Bị ngắt sau {result.budgetMs / 1000} giây</span>}>
                {ALGO_NAME[algorithm]} chưa chạy xong ở ngưỡng này nên số mẫu bên dưới chưa đầy đủ. Đây chính là giới hạn thực tế của thuật toán khi
                minsup thấp trên dữ liệu dày.
              </Note>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Thời gian chạy" value={fmtMs(result.stats.timeMs)} hint={result.stats.timedOut ? "chưa xong" : "trên server, 1 luồng"} />
            <Stat label="Mẫu phổ biến" value={fmt(result.stats.patterns)} hint={`${fmt(result.maximalCount)} mẫu maximal`} />
            <Stat
              label={ALGO_CARD[algorithm].counted}
              value={fmtCompact(result.stats.counted)}
              hint={`${pct(result.stats.patterns / Math.max(1, result.stats.counted))} trở thành mẫu phổ biến`}
            />
            <Stat label="Số lần quét CSDL gốc" value={result.stats.dbScans} hint={algorithm === "gsp" ? "mỗi mức k quét 1 lần" : "chỉ quét khi khởi tạo"} />
            <Stat label="Đỉnh cấu trúc phụ" value={fmtCompact(result.stats.peakEntries)} hint={ALGO_CARD[algorithm].peak} />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader title="Theo từng độ dài mẫu" subtitle="Bao nhiêu mẫu phải đếm support, bao nhiêu thật sự phổ biến" />
              <LevelTable stats={result.stats} />
            </Card>
            <Card>
              <CardHeader title="Đọc kết quả" subtitle="Liên hệ với lý thuyết của thuật toán" />
              <div className="space-y-2.5 p-5 text-[13px] leading-relaxed text-ink-2">
                <Insight r={result} />
              </div>
            </Card>
          </div>
        </div>
      )}

      {complete && catalog && <PatternsAndRules data={complete} items={catalog.items} />}
    </div>
  );
}

function Comparison({ runs }: { runs: MineResponse[] }) {
  const finished = runs.filter((r) => !r.stats.timedOut);
  const same = finished.length >= 2 && finished.every((r) => r.stats.patterns === finished[0].stats.patterns);
  const cols: { key: keyof MineStats; label: string; format: (n: number) => string }[] = [
    { key: "timeMs", label: "Thời gian", format: fmtMs },
    { key: "counted", label: "Mẫu phải đếm support", format: fmt },
    { key: "peakEntries", label: "Đỉnh cấu trúc phụ", format: fmt },
  ];
  return (
    <Card className="fade-up mb-4">
      <CardHeader
        title="So sánh các lần chạy"
        subtitle="Cùng dữ liệu, cùng tham số"
        right={
          same && (
            <span className="flex items-center gap-1.5 rounded-full bg-good-soft px-2.5 py-1 text-xs font-medium text-good">
              <CircleCheck className="h-3.5 w-3.5" /> Tập mẫu trùng khớp: {fmt(finished[0].stats.patterns)} mẫu
            </span>
          )
        }
      />
      <div className="thin-scroll overflow-x-auto px-5 py-3">
        <table className="tabular w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-xs text-ink-2">
              <th className="w-28 py-2 font-medium">Thuật toán</th>
              {cols.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium">
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Quét CSDL</th>
              <th className="py-2 text-right font-medium">Mẫu tìm được</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.algorithm} className="border-t border-line">
                <td className="py-2.5 font-semibold">{ALGO_NAME[r.algorithm]}</td>
                {cols.map((c) => {
                  const max = Math.max(...runs.map((x) => x.stats[c.key] as number));
                  const v = r.stats[c.key] as number;
                  return (
                    <td key={c.key} className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-sm bg-page">
                          <div className="h-2 rounded-sm" style={{ width: `${Math.max(1.5, (v / max) * 100)}%`, background: ALGO_COLOR[r.algorithm] }} />
                        </div>
                        <span className="w-[84px] shrink-0 text-right">
                          {c.key === "timeMs" && r.stats.timedOut ? "> " : ""}
                          {c.format(v)}
                        </span>
                      </div>
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-right">{r.stats.dbScans}</td>
                <td className={`py-2.5 text-right ${r.stats.timedOut ? "text-bad" : ""}`}>
                  {fmt(r.stats.patterns)}
                  {r.stats.timedOut ? " (dở dang)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LevelTable({ stats }: { stats: MineStats }) {
  const max = Math.max(...stats.levels.map((l) => l.counted), 1);
  return (
    <div className="px-5 py-3">
      <table className="tabular w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-xs text-ink-2">
            <th className="py-1.5 font-medium">Độ dài k</th>
            <th className="px-3 py-1.5 font-medium">Phải đếm</th>
            <th className="px-3 py-1.5 text-right font-medium">Phổ biến</th>
            <th className="py-1.5 text-right font-medium">Tỷ lệ</th>
          </tr>
        </thead>
        <tbody>
          {stats.levels.map((l) => (
            <tr key={l.k} className="border-t border-line">
              <td className="py-2">{l.k}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-sm bg-page">
                    <div className="h-2 rounded-sm" style={{ width: `${Math.max(1, (l.counted / max) * 100)}%`, background: ALGO_COLOR[stats.algorithm] }} />
                  </div>
                  <span className="w-20 shrink-0 text-right">{fmt(l.counted)}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right font-semibold">{fmt(l.frequent)}</td>
              <td className="py-2 text-right text-ink-2">{pct(l.frequent / Math.max(1, l.counted))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Insight({ r }: { r: MineResponse }) {
  const s = r.stats;
  const l1 = s.levels.find((l) => l.k === 1);
  const l2 = s.levels.find((l) => l.k === 2);
  const f1 = l1?.frequent ?? 0;
  if (s.algorithm === "gsp") {
    return (
      <>
        <p>
          Có <b className="text-ink">{fmt(f1)}</b> item phổ biến nên mức 2 phải sinh |F₁|² + |F₁|(|F₁|−1)/2 ={" "}
          <b className="text-ink">{fmt(f1 * f1 + (f1 * (f1 - 1)) / 2)}</b> ứng viên, trong đó chỉ {fmt(l2?.frequent ?? 0)} (
          {pct((l2?.frequent ?? 0) / Math.max(1, l2?.counted ?? 1))}) đạt minsup. Bước tỉa Apriori không giúp gì ở mức 2 vì mọi chuỗi con dài 1 đều phổ
          biến.
        </p>
        <p>
          GSP quét lại toàn bộ CSDL <b className="text-ink">{s.dbScans} lần</b>, mỗi độ dài mẫu một lần. Với CSDL nằm trên đĩa, đây là chi phí I/O lớn
          nhất của thuật toán.
        </p>
        <p>
          Tổng cộng sinh {fmt(s.generated)} ứng viên, tỉa còn {fmt(s.counted)}. Hạ minsup thì số ứng viên mức 3 tăng rất nhanh: đây là hiện tượng
          bùng nổ ứng viên.
        </p>
      </>
    );
  }
  if (s.algorithm === "spade") {
    return (
      <>
        <p>
          SPADE chỉ quét CSDL gốc <b className="text-ink">{s.dbScans} lần</b> để dựng id-list cho từng item. Từ đó support của mọi mẫu dài hơn được tính
          bằng phép join hai id-list, không cần đọc lại dữ liệu.
        </p>
        <p>
          Đổi lại là bộ nhớ: lúc cao điểm phải giữ <b className="text-ink">{fmt(s.peakEntries)}</b> cặp (sid, eid). Dữ liệu càng dày (khách mua lặp lại
          nhiều lần) thì id-list càng dài.
        </p>
        <p>
          SPADE vẫn là phương pháp sinh và kiểm tra: đã thực hiện {fmt(s.counted)} phép join, chỉ {pct(s.patterns / Math.max(1, s.counted))} cho ra mẫu
          phổ biến.
        </p>
      </>
    );
  }
  return (
    <>
      <p>
        PrefixSpan không sinh ứng viên. Nó tạo <b className="text-ink">{fmt(s.structures)}</b> CSDL chiếu, đúng bằng số mẫu phổ biến, và chỉ đếm những
        mở rộng thật sự xuất hiện trong dữ liệu.
      </p>
      <p>
        Nhờ pseudo-projection, mỗi CSDL chiếu chỉ là danh sách con trỏ, nên đỉnh bộ nhớ phụ là <b className="text-ink">{fmt(s.peakEntries)}</b> con trỏ.
      </p>
      <p>
        Điểm cần lưu ý: dữ liệu này dày (giỏ trung bình khoảng 10 món, khách mua lặp lại), nên trong các CSDL chiếu vẫn có{" "}
        <b className="text-ink">{fmtCompact(s.counted)}</b> mở rộng phải đếm và phần lớn không đạt minsup. Chi phí của PrefixSpan nằm ở việc quét các
        CSDL chiếu này.
      </p>
    </>
  );
}

function PatternsAndRules({ data, items }: { data: MineResponse; items: Item[] }) {
  const [tab, setTab] = useState<"patterns" | "rules">("rules");
  const [q, setQ] = useState("");
  const [len, setLen] = useState("all");
  const [onlyMaximal, setOnlyMaximal] = useState(false);
  const [sort, setSort] = useState<"confidence" | "lift" | "support">("confidence");
  const [limit, setLimit] = useState(30);

  const needle = q.trim().toLowerCase();
  const matches = (ids: number[]) => !needle || ids.some((id) => items[id].name.toLowerCase().includes(needle));
  const patterns = useMemo(
    () => data.patternRows.filter((r) => (len === "all" || r.k === Number(len)) && (!onlyMaximal || r.m) && matches(r.p.flat())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, len, onlyMaximal, needle],
  );
  const rules = useMemo(
    () =>
      data.rules
        .filter((r) => matches([...r.antecedent.flat(), r.consequent]))
        .sort((a, b) => b[sort] - a[sort]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, sort, needle],
  );
  const lengths = Object.keys(data.byLength).map(Number).filter((k) => k >= 2);

  return (
    <Card className="fade-up">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <Segmented
          value={tab}
          onChange={(t) => {
            setTab(t);
            setLimit(30);
          }}
          options={[
            { value: "rules", label: `Luật tuần tự (${fmt(data.ruleCount)})` },
            { value: "patterns", label: `Mẫu phổ biến (${fmt(data.patternRowsTotal)})` },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Lọc theo tên sản phẩm…"
            aria-label="Lọc theo tên sản phẩm"
            className="h-8 w-52 rounded-md border border-line-strong px-2.5"
          />
          {tab === "patterns" ? (
            <>
              <select value={len} onChange={(e) => setLen(e.target.value)} aria-label="Độ dài mẫu" className="h-8 rounded-md border border-line-strong bg-surface px-2">
                <option value="all">Mọi độ dài</option>
                {lengths.map((k) => (
                  <option key={k} value={k}>
                    {k} item ({fmt(data.byLength[k].all)})
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={onlyMaximal} onChange={(e) => setOnlyMaximal(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                Chỉ mẫu maximal
              </label>
            </>
          ) : (
            <label className="flex items-center gap-2 text-ink-2">
              Xếp theo
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-8 rounded-md border border-line-strong bg-surface px-2 text-ink">
                <option value="confidence">Confidence</option>
                <option value="lift">Lift</option>
                <option value="support">Support</option>
              </select>
            </label>
          )}
        </div>
      </header>

      <div className="thin-scroll overflow-x-auto">
        {tab === "patterns" ? (
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
                <th className="px-5 py-2 font-medium">Mẫu tuần tự (mỗi ô là một đơn hàng)</th>
                <th className="tabular px-3 py-2 text-right font-medium">Support</th>
                <th className="px-5 py-2 text-right font-medium">Tỷ lệ</th>
              </tr>
            </thead>
            <tbody>
              {patterns.slice(0, limit).map((r, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="px-5 py-2">
                    <PatternView pattern={r.p} items={items} max={30} />
                  </td>
                  <td className="tabular px-3 py-2 text-right font-semibold">{fmt(r.s)}</td>
                  <td className="tabular px-5 py-2 text-right text-ink-2">{pct(r.s / data.sequences)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[820px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
                <th className="px-5 py-2 font-medium">Nếu khách đã mua … thì đơn sau mua</th>
                <th className="tabular px-3 py-2 text-right font-medium">Support</th>
                <th className="tabular px-3 py-2 text-right font-medium">Confidence</th>
                <th className="px-5 py-2 text-right font-medium">Lift</th>
              </tr>
            </thead>
            <tbody>
              {rules.slice(0, limit).map((r, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="px-5 py-2">
                    <PatternView pattern={r.antecedent} items={items} then={r.consequent} max={30} />
                  </td>
                  <td className="tabular px-3 py-2 text-right">{fmt(r.support)}</td>
                  <td className="tabular px-3 py-2 text-right font-semibold">{pct(r.confidence)}</td>
                  <td className="tabular px-5 py-2 text-right text-ink-2">{r.lift.toFixed(2).replace(".", ",")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs text-ink-3">
        <span>
          {tab === "patterns"
            ? `Đang lọc trong ${fmt(data.patternRows.length)} mẫu có support cao nhất (dài từ 2 item). Maximal: mẫu không có mẫu cha phổ biến nào.`
            : `Đang lọc trong ${fmt(data.rules.length)} luật có confidence cao nhất. Luật ⟨A⟩ ⇒ A nghĩa là khách mua lại chính món đó.`}
        </span>
        {limit < (tab === "patterns" ? patterns.length : rules.length) && (
          <button onClick={() => setLimit((l) => l + 50)} className="rounded-md border border-line-strong px-3 py-1.5 text-[12.5px] font-medium text-ink hover:border-brand-500 hover:text-brand-700">
            Hiện thêm 50 dòng
          </button>
        )}
      </footer>
    </Card>
  );
}
