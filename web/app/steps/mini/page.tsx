"use client";

import { Check, ChevronLeft, ChevronRight, Pause, Play, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ALGO_COLOR, ALGO_IDS, ALGO_NAME } from "@/components/charts";
import { Card, Note, PageTitle, Segmented } from "@/components/ui";
import { MINI_DB, MINI_ITEMS, TOY_DB, TOY_ITEMS, keyOf, latestMatchGap, mine, type AlgorithmId, type Pattern, type Sequence } from "@/lib/mining";
import { type Frame, type IdList, type Scene, type Story, buildStory } from "./frames";

interface ItemInfo {
  label: string;
  image?: string;
}

const DATASETS = {
  mini: { name: "Cửa hàng mini", db: MINI_DB, items: MINI_ITEMS as ItemInfo[], minsups: [2, 3], who: "K" },
  paper: { name: "Ví dụ trong bài báo PrefixSpan", db: TOY_DB, items: TOY_ITEMS.map((label) => ({ label })) as ItemInfo[], minsups: [2, 3, 4], who: "S" },
};
type DatasetId = keyof typeof DATASETS;

const STAGES = [
  { n: 1, label: "Dữ liệu" },
  { n: 2, label: "Khai thác mẫu" },
  { n: 3, label: "Sinh luật" },
  { n: 4, label: "Gợi ý" },
] as const;

const DECAY = 0.85;
const pctText = (x: number) => `${Math.round(x * 100)}%`;

// ---------------------------------------------------------------------------
// Hiển thị món, đơn hàng, mẫu
// ---------------------------------------------------------------------------

function ItemChip({ item, dim = false }: { item: ItemInfo; dim?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 transition-opacity duration-300 ${dim ? "opacity-25" : ""}`}>
      {item.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt="" className="h-5 w-5 rounded-sm object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
      )}
      <span className={item.image ? "text-[12.5px] font-medium" : "font-mono text-[13px] font-medium"}>{item.label}</span>
    </span>
  );
}

/** Một mẫu: mỗi ô là một đơn hàng, mũi tên là "ở một đơn sau đó". */
function Pat({ p, items, tone = "plain" }: { p: Pattern; items: ItemInfo[]; tone?: "plain" | "good" | "muted" }) {
  const box =
    tone === "good" ? "border-[#9fd8bf] bg-good-soft" : tone === "muted" ? "border-line bg-page text-ink-3" : "border-line-strong bg-surface";
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {p.map((el, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <Arrow />}
          <span className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 ${box}`}>
            {el.map((id, j) => (
              <span key={id} className="inline-flex items-center gap-1.5">
                {j > 0 && <span className="text-xs text-ink-3">+</span>}
                <ItemChip item={items[id]} />
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

function Arrow() {
  return (
    <svg width="16" height="8" viewBox="0 0 16 8" className="shrink-0 text-ink-3" aria-label="rồi">
      <path d="M0 4h14M11 1l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Trang
// ---------------------------------------------------------------------------

export default function MiniStepsPage() {
  const [datasetId, setDatasetId] = useState<DatasetId>("mini");
  const [algorithm, setAlgorithm] = useState<AlgorithmId>("gsp");
  const [minSupport, setMinSupport] = useState(2);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("1");

  const ds = DATASETS[datasetId];
  const show = useMemo(() => {
    const items = DATASETS[datasetId].items;
    return (p: Pattern) => `⟨${p.map((el) => (el.length === 1 ? items[el[0]].label : `{${el.map((i) => items[i].label).join(", ")}}`)).join(" → ")}⟩`;
  }, [datasetId]);
  const story = useMemo(() => buildStory(algorithm, ds.db, ds.items.length, minSupport, show), [algorithm, ds, minSupport, show]);

  const i = Math.min(index, story.frames.length - 1);
  const frame = story.frames[i];
  const last = story.frames.length - 1;

  const reset = (fn: () => void) => {
    fn();
    setIndex(0);
    setPlaying(false);
  };

  // Tự phát: các khung "quét" chạy nhanh hơn, các khung cần đọc thì dừng lâu hơn
  useEffect(() => {
    if (!playing) return;
    if (i >= last) {
      setPlaying(false);
      return;
    }
    const base = frame.scene.kind === "gsp-scan" ? 900 : frame.scene.kind === "gsp-gen" ? 1500 : 2200;
    const t = setTimeout(() => setIndex(i + 1), base / Number(speed));
    return () => clearTimeout(t);
  }, [playing, i, last, frame.scene.kind, speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT") return;
      if (e.key === "ArrowRight") setIndex((x) => Math.min(x + 1, last));
      if (e.key === "ArrowLeft") setIndex((x) => Math.max(x - 1, 0));
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  const stageStart = (n: number) => story.frames.findIndex((f) => f.stage === n);

  return (
    <div>
      <PageTitle
        title="Minh hoạ: từ đơn hàng đến gợi ý"
        lead="Theo dõi toàn bộ đường đi trên một cửa hàng tí hon: dữ liệu mua hàng, thuật toán tìm mẫu phổ biến, mẫu thành luật, luật thành gợi ý. Phần khai thác mẫu chạy bằng đúng mã nguồn GSP, SPADE, PrefixSpan dùng trên dữ liệu thật."
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ink-2">Ví dụ</span>
            <Segmented
              size="sm"
              value={datasetId}
              onChange={(v) => reset(() => { setDatasetId(v); setMinSupport(2); })}
              options={(Object.keys(DATASETS) as DatasetId[]).map((id) => ({ value: id, label: DATASETS[id].name }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ink-2">Thuật toán</span>
            <Segmented value={algorithm} onChange={(v) => reset(() => setAlgorithm(v))} options={ALGO_IDS.map((id) => ({ value: id, label: ALGO_NAME[id] }))} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ink-2">minsup</span>
            <Segmented
              size="sm"
              value={String(minSupport)}
              onChange={(v) => reset(() => setMinSupport(Number(v)))}
              options={ds.minsups.map((n) => ({ value: String(n), label: `${n} khách` }))}
            />
          </div>
        </div>
        <ol className="grid grid-cols-4 border-t border-line">
          {STAGES.map((s) => {
            const state = frame.stage === s.n ? "now" : frame.stage > s.n ? "done" : "todo";
            return (
              <li key={s.n} className="border-r border-line last:border-r-0">
                <button
                  onClick={() => {
                    setIndex(stageStart(s.n));
                    setPlaying(false);
                  }}
                  aria-current={state === "now" ? "step" : undefined}
                  className={`flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors ${state === "now" ? "bg-brand-50" : "hover:bg-page"}`}
                >
                  <span
                    className={`tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      state === "now" ? "bg-brand-600 text-white" : state === "done" ? "bg-good text-white" : "bg-page text-ink-3 ring-1 ring-line-strong"
                    }`}
                  >
                    {state === "done" ? <Check className="h-3.5 w-3.5" /> : s.n}
                  </span>
                  <span className={`text-[13px] font-medium ${state === "now" ? "text-brand-800" : state === "done" ? "text-ink" : "text-ink-3"}`}>
                    {s.label}
                    {s.n === 2 && <span className="font-normal text-ink-3"> · {ALGO_NAME[algorithm]}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[350px_minmax(0,1fr)]">
        <div className="space-y-4">
          <DbCard db={ds.db} items={ds.items} who={ds.who} scene={frame.scene} minSupport={minSupport} />
          <FoundCard story={story} frame={frame} items={ds.items} />
        </div>

        <Card className="self-start">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: frame.stage === 2 ? ALGO_COLOR[algorithm] : "#1a56c9" }} />
              <h2 className="truncate text-[15px] font-semibold">{frame.title}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (i >= last) setIndex(0);
                  setPlaying((p) => !p);
                }}
                className="flex h-8 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-[13px] font-medium text-white hover:bg-brand-700"
              >
                {playing ? <Pause className="h-3.5 w-3.5" /> : i >= last ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {playing ? "Tạm dừng" : i >= last ? "Phát lại" : "Tự phát"}
              </button>
              <select value={speed} onChange={(e) => setSpeed(e.target.value)} aria-label="Tốc độ" className="h-8 rounded-md border border-line-strong bg-surface px-1.5 text-xs">
                <option value="0.5">0,5×</option>
                <option value="1">1×</option>
                <option value="2">2×</option>
              </select>
              <button onClick={() => { setPlaying(false); setIndex(Math.max(0, i - 1)); }} disabled={i === 0} aria-label="Bước trước" className="flex h-8 w-8 items-center justify-center rounded-md border border-line-strong hover:border-brand-500 disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => { setPlaying(false); setIndex(Math.min(last, i + 1)); }} disabled={i === last} aria-label="Bước sau" className="flex h-8 w-8 items-center justify-center rounded-md border border-line-strong hover:border-brand-500 disabled:opacity-40">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </header>
          <div className="flex items-center gap-3 border-b border-line bg-page/50 px-5 py-2">
            <input
              type="range"
              min={0}
              max={last}
              value={i}
              onChange={(e) => {
                setPlaying(false);
                setIndex(Number(e.target.value));
              }}
              aria-label="Vị trí trong minh hoạ"
              className="flex-1"
            />
            <span className="tabular w-16 shrink-0 text-right text-xs text-ink-2">
              {i + 1} / {last + 1}
            </span>
          </div>
          <div key={`${datasetId}-${algorithm}-${minSupport}-${frame.scene.kind === "gsp-scan" ? `scan-${frame.scene.k}` : i}`} className="fade-up min-h-[340px] space-y-4 p-5">
            <SceneView frame={frame} story={story} ds={ds} minSupport={minSupport} algorithm={algorithm} show={show} />
          </div>
          <footer className="border-t border-line px-5 py-2.5 text-xs text-ink-3">Phím ← → để chuyển bước, phím cách để phát hoặc dừng.</footer>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cột trái: CSDL chuỗi và danh sách mẫu đã tìm
// ---------------------------------------------------------------------------

function DbCard({ db, items, who, scene, minSupport }: { db: Sequence[]; items: ItemInfo[]; who: string; scene: Scene; minSupport: number }) {
  const scanning = scene.kind === "gsp-scan" ? scene.sid : -1;
  const proj = scene.kind === "ps-project" ? scene : null;
  const lastMax = proj ? Math.max(...proj.prefix[proj.prefix.length - 1]) : -1;
  return (
    <Card>
      <header className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Lịch sử mua hàng</h2>
        <span className="tabular text-xs text-ink-2">
          {db.length} khách · minsup = {minSupport}
        </span>
      </header>
      <ul className="divide-y divide-line">
        {db.map((seq, sid) => {
          const p = proj?.projected.find((x) => x.sid === sid);
          const out = proj && !p;
          return (
            <li
              key={sid}
              className={`flex items-start gap-2.5 px-4 py-2.5 transition-colors duration-300 ${scanning === sid ? "bg-brand-50 shadow-[inset_3px_0_0_var(--color-brand-600)]" : ""}`}
            >
              <span className={`tabular mt-1 w-6 shrink-0 text-xs font-semibold ${scanning === sid ? "text-brand-700" : "text-ink-2"}`}>
                {who}
                {sid + 1}
              </span>
              <div className={`flex flex-wrap items-center gap-1 transition-opacity duration-300 ${out ? "opacity-30" : ""}`}>
                {seq.map((el, e) => {
                  const consumed = p ? e < p.from : false;
                  const partial = p ? e === p.from : false;
                  const live = p ? e > p.from || (partial && p.partial) : false;
                  return (
                    <span key={e} className="inline-flex items-center gap-1">
                      {e > 0 && <Arrow />}
                      <span
                        className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 transition-colors duration-300 ${
                          live ? "border-[#8fd3b5] bg-good-soft" : "border-line-strong bg-surface"
                        }`}
                        title={`Đơn ${e + 1}`}
                      >
                        {el.map((id) => (
                          <ItemChip key={id} item={items[id]} dim={consumed || (partial && id <= lastMax)} />
                        ))}
                      </span>
                    </span>
                  );
                })}
              </div>
              {out && <span className="ml-auto shrink-0 text-[11px] text-ink-3">không có tiền tố</span>}
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line px-4 py-2.5 text-[11.5px] leading-relaxed text-ink-3">
        Mỗi ô là một đơn hàng, mũi tên là thứ tự thời gian. Hai món trong cùng ô là mua cùng lúc.
        {proj && " Phần mờ là tiền tố đã khớp; phần xanh là phần còn lại để đếm."}
      </p>
    </Card>
  );
}

function FoundCard({ story, frame, items }: { story: Story; frame: Frame; items: ItemInfo[] }) {
  const list = story.found.slice(0, frame.foundCount);
  return (
    <Card>
      <header className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Mẫu phổ biến đã tìm</h2>
        <span className="tabular text-xs text-ink-2">
          {list.length} / {story.found.length}
        </span>
      </header>
      {list.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">Chưa có mẫu nào. Bấm “Tự phát” hoặc phím →.</p>
      ) : (
        <ul className="thin-scroll max-h-[300px] divide-y divide-line overflow-y-auto">
          {list.map((f, n) => (
            <li key={keyOf(f.pattern)} className={`flex items-center justify-between gap-2 px-4 py-1.5 ${n >= list.length - frame.fresh ? "fade-up bg-good-soft/60" : ""}`}>
              <Pat p={f.pattern} items={items} />
              <span className="tabular shrink-0 text-xs text-ink-2">
                <b className="text-ink">{f.support}</b> khách
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Khung chính: từng cảnh
// ---------------------------------------------------------------------------

type Ds = (typeof DATASETS)[DatasetId];

function Say({ children }: { children: React.ReactNode }) {
  return <p className="border-l-2 border-brand-500 pl-3 text-[13.5px] leading-relaxed text-ink">{children}</p>;
}

function SceneView({
  frame,
  story,
  ds,
  minSupport,
  algorithm,
  show,
}: {
  frame: Frame;
  story: Story;
  ds: Ds;
  minSupport: number;
  algorithm: AlgorithmId;
  show: (p: Pattern) => string;
}) {
  const s = frame.scene;
  const items = ds.items;
  const who = ds.who;

  if (s.kind === "data") {
    return (
      <>
        <Say>
          Cửa hàng có {ds.db.length} khách. Mỗi khách là một <b>chuỗi</b> các đơn hàng theo thời gian (cột bên trái). Mục tiêu: tìm mọi trình tự mua hàng
          xuất hiện ở ít nhất <b>{minSupport} khách</b>, gọi là mẫu phổ biến.
        </Say>
        <div className="grid gap-3 sm:grid-cols-3">
          <Fact label="Một mẫu là gì" body={<>Một trình tự ngắn, ví dụ <Pat p={[[0], [Math.min(2, items.length - 1)]]} items={items} />: mua món đầu, rồi một đơn sau đó mua món kia.</>} />
          <Fact label="Khi nào khách “chứa” mẫu" body="Các đơn của mẫu xuất hiện đúng thứ tự trong lịch sử của khách. Không cần liền nhau." />
          <Fact label="Support" body="Số khách chứa mẫu. Mỗi khách tính một lần, dù lặp lại nhiều lần." />
        </div>
        <Note>
          Ba thuật toán sẽ cho ra <b>cùng một danh sách mẫu</b>. Hãy chọn từng thuật toán ở trên và bấm “Tự phát” để xem chúng đi ba con đường khác nhau.
        </Note>
      </>
    );
  }

  if (s.kind === "gsp-gen") {
    const n = s.k === 2 ? story.found.filter((f) => f.pattern.length === 1 && f.pattern[0].length === 1).length : 0;
    return (
      <>
        <Say>
          {s.k === 1 && <>GSP bắt đầu từ các món đơn lẻ. Mỗi món là một ứng viên dài 1.</>}
          {s.k === 2 && (
            <>
              Từ {n} món phổ biến, GSP lập <b>mọi cặp có thể</b>: {n}² = {n * n} cặp trước–sau và {n}×{n - 1}/2 = {(n * (n - 1)) / 2} cặp cùng đơn, tổng{" "}
              <b>{s.candidates.length} ứng viên</b>. Chưa biết cái nào có thật trong dữ liệu.
            </>
          )}
          {s.k >= 3 && (
            <>
              Ghép hai mẫu dài {s.k - 1} khi đuôi mẫu này trùng đầu mẫu kia để được ứng viên dài {s.k}.{" "}
              {s.pruned.length > 0 && <>Ứng viên có mẫu con không phổ biến bị loại ngay, không cần đếm (gạch ngang).</>}
            </>
          )}
        </Say>
        <CandGrid candidates={s.candidates} items={items} />
        {s.pruned.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-medium text-ink-2">Bị loại nhờ tính chất Apriori ({s.pruned.length})</h3>
            <div className="flex flex-wrap gap-1.5 opacity-60">
              {s.pruned.map((p, n2) => (
                <span key={n2} className="line-through decoration-ink-3">
                  <Pat p={p} items={items} tone="muted" />
                </span>
              ))}
            </div>
          </div>
        )}
        {s.candidates.length === 0 && <Note>Không còn ứng viên nào. GSP dừng ở đây.</Note>}
      </>
    );
  }

  if (s.kind === "gsp-scan") {
    return (
      <>
        <Say>
          Lần quét thứ {s.k}: mở lịch sử của <b>{who}{s.sid + 1}</b> (đang sáng ở cột trái) và dò từng ứng viên. Ứng viên nào nằm trong chuỗi thì cộng 1.
        </Say>
        <CandGrid candidates={s.candidates} items={items} counts={s.counts} hit={s.hit} />
      </>
    );
  }

  if (s.kind === "gsp-result") {
    const ok = s.frequent.filter(Boolean).length;
    return (
      <>
        <Say>
          Quét xong {ds.db.length} khách. Giữ lại ứng viên có từ {minSupport} khách trở lên: <b>{ok} / {s.candidates.length}</b> đạt.{" "}
          {s.candidates.length - ok > 0 && <>{s.candidates.length - ok} ứng viên còn lại là công đếm bỏ đi.</>}
        </Say>
        <CandGrid candidates={s.candidates} items={items} counts={s.counts} frequent={s.frequent} />
        <Note tone="warn">
          GSP vừa quét toàn bộ dữ liệu lần thứ {s.k}. Mỗi độ dài mẫu là một lần quét, và số ứng viên tăng rất nhanh theo số món: đó là hạn chế chính của GSP.
        </Note>
      </>
    );
  }

  if (s.kind === "spade-vertical") {
    return (
      <>
        <Say>
          SPADE quét dữ liệu <b>đúng một lần</b> và ghi lại cho mỗi món: khách nào mua, ở đơn thứ mấy. Support là số khách khác nhau trong danh sách. Từ đây
          SPADE không mở lại dữ liệu gốc nữa.
        </Say>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {s.lists.map((l) => (
            <div key={l.item} className={`rounded-md border p-3 ${l.frequent ? "border-line-strong" : "border-line opacity-50"}`}>
              <div className="mb-2 flex items-center justify-between">
                <ItemChip item={items[l.item]} />
                <span className={`tabular text-xs ${l.frequent ? "font-semibold text-good" : "text-ink-3"}`}>{l.support} khách</span>
              </div>
              <Pairs list={l.idlist} who={who} />
            </div>
          ))}
        </div>
      </>
    );
  }

  if (s.kind === "spade-join") {
    const sids = [...new Set([...s.aList, ...s.bList].map(([sid]) => sid))].sort((x, y) => x - y);
    const eids = (list: IdList, sid: number) => list.filter(([x]) => x === sid).map(([, e]) => e);
    return (
      <>
        <Say>
          Muốn biết support của <b>{show(s.result)}</b>, SPADE so hai danh sách vị trí.{" "}
          {s.join === "temporal" ? (
            <>
              Quy tắc <b>trước–sau</b>: giữ các đơn của {show(s.b)} nằm <b>sau</b> lần xuất hiện đầu tiên của {show(s.a)} ở cùng khách.
            </>
          ) : (
            <>
              Quy tắc <b>cùng đơn</b>: giữ các vị trí mà cả hai cùng có mặt (cùng khách, cùng đơn).
            </>
          )}
        </Say>
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-xs text-ink-2">
                <th className="w-16 py-1.5 font-medium">Khách</th>
                <th className="px-3 py-1.5 font-medium"><Pat p={s.a} items={items} /> ở đơn</th>
                <th className="px-3 py-1.5 font-medium"><Pat p={s.b} items={items} /> ở đơn</th>
                <th className="py-1.5 font-medium">Giữ lại</th>
              </tr>
            </thead>
            <tbody>
              {sids.map((sid) => {
                const kept = eids(s.idlist, sid);
                const a = eids(s.aList, sid);
                const b = eids(s.bList, sid);
                return (
                  <tr key={sid} className={`border-b border-line ${kept.length ? "bg-good-soft/50" : ""}`}>
                    <td className="tabular py-2 font-semibold">{who}{sid + 1}</td>
                    <td className="tabular px-3 py-2">{a.length ? a.map((e) => e + 1).join(", ") : <span className="text-ink-3">không mua</span>}</td>
                    <td className="tabular px-3 py-2">
                      {b.length ? b.map((e, n) => <span key={n} className={kept.includes(e) ? "font-semibold text-good" : "text-ink-3"}>{n > 0 ? ", " : ""}{e + 1}</span>) : <span className="text-ink-3">không mua</span>}
                    </td>
                    <td className="py-2">
                      {kept.length ? (
                        <span className="tabular flex items-center gap-1 font-medium text-good"><Check className="h-3.5 w-3.5" /> đơn {kept.map((e) => e + 1).join(", ")}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-ink-3"><X className="h-3.5 w-3.5" /> {!a.length || !b.length ? "thiếu một bên" : s.join === "temporal" ? "không có đơn nào sau" : "không cùng đơn"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Verdict ok={s.frequent} text={<>{show(s.result)} có ở <b>{s.support} khách</b>, {s.frequent ? `đạt minsup ${minSupport}: là mẫu phổ biến.` : `chưa đạt minsup ${minSupport}: bỏ.`}</>} />
      </>
    );
  }

  if (s.kind === "ps-root") {
    return (
      <>
        <Say>
          PrefixSpan quét dữ liệu một lần để đếm từng món. Món nào đạt minsup sẽ làm <b>tiền tố</b>: điểm bắt đầu để mở rộng dần thành mẫu dài hơn.
        </Say>
        <Bars rows={s.counts.map((c) => ({ key: String(c.item), label: <ItemChip item={items[c.item]} />, value: c.support, ok: c.frequent }))} max={ds.db.length} minSupport={minSupport} />
      </>
    );
  }

  if (s.kind === "ps-project") {
    return (
      <>
        <Say>
          Cố định tiền tố <b>{show(s.prefix)}</b>. Ở cột trái, với mỗi khách có tiền tố này, chỉ giữ <b>phần phía sau</b> (màu xanh). Giờ chỉ cần đếm các món
          trong phần đó, không phải đoán ứng viên nào.
        </Say>
        {s.extensions.length === 0 ? (
          <Note>Phía sau tiền tố này không còn món nào. Nhánh này dừng.</Note>
        ) : (
          <Bars
            rows={s.extensions.map((x) => ({
              key: `${x.kind}${x.item}`,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-[11px] text-ink-3">{x.kind === "s" ? "đơn sau:" : "cùng đơn:"}</span>
                  <ItemChip item={items[x.item]} />
                </span>
              ),
              value: x.support,
              ok: x.frequent,
              note: x.frequent ? <>được mẫu <Pat p={x.result} items={items} tone="good" /></> : undefined,
            }))}
            max={ds.db.length}
            minSupport={minSupport}
          />
        )}
        <p className="text-xs text-ink-3">
          Dữ liệu phải xem là {s.projected.length} / {ds.db.length} khách, và chỉ phần sau tiền tố. Tiền tố càng dài thì phần này càng nhỏ.
        </p>
      </>
    );
  }

  if (s.kind === "mined") return <MinedSummary story={story} ds={ds} minSupport={minSupport} algorithm={algorithm} />;
  if (s.kind === "rules") return <RulesScene story={story} items={items} show={show} />;
  return <RecommendScene story={story} items={items} show={show} />;
}

function Fact({ label, body }: { label: string; body: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line p-3">
      <div className="text-xs font-semibold text-ink">{label}</div>
      <div className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{body}</div>
    </div>
  );
}

function Verdict({ ok, text }: { ok: boolean; text: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] ${ok ? "border-[#b9e2cf] bg-good-soft text-[#0b5a40]" : "border-line bg-page text-ink-2"}`}>
      {ok ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
      <span>{text}</span>
    </div>
  );
}

function Pairs({ list, who }: { list: IdList; who: string }) {
  return (
    <div className="tabular flex flex-wrap gap-1 text-[11.5px] text-ink-2">
      {list.map(([s, e], n) => (
        <span key={n} className="rounded bg-page px-1.5 py-0.5">
          {who}{s + 1} · đơn {e + 1}
        </span>
      ))}
    </div>
  );
}

/** Lưới ứng viên của GSP: bộ đếm tăng dần khi quét từng khách. */
function CandGrid({ candidates, items, counts, hit, frequent }: { candidates: Pattern[]; items: ItemInfo[]; counts?: number[]; hit?: boolean[]; frequent?: boolean[] }) {
  if (candidates.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {candidates.map((c, n) => {
        const isHit = hit?.[n];
        const state = frequent ? (frequent[n] ? "good" : "bad") : isHit ? "hit" : "idle";
        return (
          <div
            key={keyOf(c)}
            className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 transition-all duration-300 ${
              state === "good"
                ? "border-[#8fd3b5] bg-good-soft"
                : state === "bad"
                  ? "border-line bg-page opacity-45"
                  : state === "hit"
                    ? "border-brand-500 bg-brand-50"
                    : "border-line bg-surface"
            }`}
          >
            <Pat p={c} items={items} />
            {counts && (
              <span className="tabular flex shrink-0 items-center gap-1 text-sm font-semibold">
                {isHit && <span className="text-[10.5px] font-semibold text-brand-700">+1</span>}
                <span className={state === "good" ? "text-good" : state === "bad" ? "text-ink-3" : "text-ink"}>{counts[n]}</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Bars({
  rows,
  max,
  minSupport,
}: {
  rows: { key: string; label: React.ReactNode; value: number; ok: boolean; note?: React.ReactNode }[];
  max: number;
  minSupport: number;
}) {
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[150px_1fr] items-center gap-3">
          <div className="min-w-0">{r.label}</div>
          <div className="flex items-center gap-2.5">
            <div className="relative h-5 w-40 shrink-0 rounded-sm bg-page">
              <div className={`h-5 rounded-sm transition-all duration-500 ${r.ok ? "bg-prefixspan" : "bg-line-strong"}`} style={{ width: `${(r.value / max) * 100}%` }} />
              <div className="absolute inset-y-0 w-px bg-ink/50" style={{ left: `${(minSupport / max) * 100}%` }} title={`minsup = ${minSupport}`} />
            </div>
            <span className={`tabular w-14 shrink-0 text-[13px] font-semibold ${r.ok ? "text-ink" : "text-ink-3"}`}>{r.value} khách</span>
            {r.note ? <span className="text-xs text-ink-2">{r.note}</span> : !r.ok ? <span className="text-xs text-ink-3">dưới minsup, bỏ</span> : null}
          </div>
        </div>
      ))}
      <p className="text-[11.5px] text-ink-3">Vạch dọc đánh dấu minsup = {minSupport} khách.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tổng kết khai thác, sinh luật, gợi ý
// ---------------------------------------------------------------------------

function MinedSummary({ story, ds, minSupport, algorithm }: { story: Story; ds: Ds; minSupport: number; algorithm: AlgorithmId }) {
  const all = useMemo(
    () => ALGO_IDS.map((id) => ({ id, stats: mine(id, ds.db, { minSupport, maxLength: 8, nItems: ds.items.length }).stats })),
    [ds, minSupport],
  );
  const max = Math.max(...all.map((a) => a.stats.counted));
  return (
    <>
      <Say>
        {ALGO_NAME[algorithm]} tìm được <b>{story.found.length} mẫu phổ biến</b> (cột trái). Chạy hai thuật toán còn lại trên cùng dữ liệu cũng ra đúng{" "}
        {story.found.length} mẫu này. Khác nhau là công sức bỏ ra:
      </Say>
      <table className="tabular w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-strong text-left text-xs text-ink-2">
            <th className="py-1.5 font-medium">Thuật toán</th>
            <th className="px-3 py-1.5 font-medium">Số mẫu phải đếm support</th>
            <th className="px-3 py-1.5 text-right font-medium">Quét dữ liệu gốc</th>
            <th className="py-1.5 text-right font-medium">Mẫu tìm được</th>
          </tr>
        </thead>
        <tbody>
          {all.map(({ id, stats }) => (
            <tr key={id} className={`border-b border-line ${id === algorithm ? "bg-brand-50/60" : ""}`}>
              <td className="py-2 font-semibold">{ALGO_NAME[id]}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-40 rounded-sm bg-page">
                    <div className="h-2 rounded-sm" style={{ width: `${(stats.counted / max) * 100}%`, background: ALGO_COLOR[id] }} />
                  </div>
                  {stats.counted}
                </div>
              </td>
              <td className="px-3 py-2 text-right">{stats.dbScans} lần</td>
              <td className="py-2 text-right">{stats.patterns}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Note>
        Trên ví dụ tí hon khác biệt còn nhỏ. Trên dữ liệu thật với 300 sản phẩm, riêng mức 2 của GSP đã có 134.850 ứng viên. Xem ở tab{" "}
        <Link href="/lab" className="font-medium underline">Khai thác mẫu</Link>.
      </Note>
    </>
  );
}

function RulesScene({ story, items, show }: { story: Story; items: ItemInfo[]; show: (p: Pattern) => string }) {
  return (
    <>
      <Say>
        Mẫu mới chỉ là quan sát. Để gợi ý, tách món cuối của mẫu ra làm <b>vế phải</b>, phần còn lại là <b>vế trái</b>: “đã mua … thì đơn sau mua …”.
        Độ tin cậy (confidence) = support của cả mẫu ÷ support của vế trái.
      </Say>
      {story.rules.length === 0 ? (
        <Note>Ở ngưỡng minsup này không có mẫu nào dài từ 2 đơn trở lên, nên không sinh được luật.</Note>
      ) : (
        <div className="thin-scroll max-h-[420px] overflow-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line-strong text-left text-xs text-ink-2">
                <th className="py-1.5 font-medium">Đã mua</th>
                <th className="px-3 py-1.5 font-medium">Đơn sau mua</th>
                <th className="px-3 py-1.5 font-medium">Cách tính</th>
                <th className="py-1.5 text-right font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {story.rules.map((r, n) => {
                const ant = story.patterns.get(keyOf(r.antecedent)) ?? 0;
                return (
                  <tr key={n} className="border-b border-line">
                    <td className="py-2"><Pat p={r.antecedent} items={items} /></td>
                    <td className="px-3 py-2"><Pat p={[[r.consequent]]} items={items} tone="good" /></td>
                    <td className="tabular px-3 py-2 text-ink-2" title={`${show([...r.antecedent, [r.consequent]])} có ${r.support} khách; ${show(r.antecedent)} có ${ant} khách`}>
                      {r.support} khách ÷ {ant} khách
                    </td>
                    <td className="tabular py-2 text-right text-[15px] font-semibold">{pctText(r.confidence)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-3">
        Bước này chỉ là phép chia trên các support đã đếm sẵn, không cần chạy lại thuật toán. Vì ba thuật toán cho cùng tập mẫu nên cũng cho cùng tập luật.
      </p>
    </>
  );
}

function RecommendScene({ story, items, show }: { story: Story; items: ItemInfo[]; show: (p: Pattern) => string }) {
  const [history, setHistory] = useState<number[][]>([[0]]);
  const clean = history.map((o) => [...o].sort((a, b) => a - b)).filter((o) => o.length > 0);

  const fired = useMemo(() => {
    const out = story.rules
      .map((r) => ({ r, gap: latestMatchGap(clean, r.antecedent) }))
      .filter((x) => x.gap >= 0)
      .map((x) => ({ ...x, score: x.r.confidence * Math.pow(DECAY, x.gap) }));
    out.sort((a, b) => b.score - a.score);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story, JSON.stringify(clean)]);
  const best = new Map<number, (typeof fired)[number]>();
  for (const f of fired) if (!best.has(f.r.consequent)) best.set(f.r.consequent, f);
  const ranked = [...best.values()];

  const toggle = (o: number, id: number) =>
    setHistory((h) => h.map((order, n) => (n !== o ? order : order.includes(id) ? order.filter((x) => x !== id) : [...order, id])));

  return (
    <>
      <Say>
        Một khách mới ghé cửa hàng. Chọn những gì họ đã mua; hệ thống tìm các luật có vế trái <b>khớp với lịch sử đó</b>, chấm điểm rồi xếp hạng món ở vế
        phải.
      </Say>

      <div className="rounded-md border border-line p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold">Lịch sử của khách (bấm để chọn món)</h3>
          <div className="flex gap-2">
            {history.length < 3 && (
              <button onClick={() => setHistory((h) => [...h, []])} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                <Plus className="h-3 w-3" /> Thêm đơn
              </button>
            )}
            {history.length > 1 && (
              <button onClick={() => setHistory((h) => h.slice(0, -1))} className="text-xs font-medium text-ink-2 hover:underline">
                Bỏ đơn cuối
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {history.map((order, o) => (
            <div key={o} className="flex items-center gap-2">
              {o > 0 && <Arrow />}
              <div className="rounded-md border border-line-strong bg-page/60 p-1.5">
                <div className="tabular mb-1 text-[10.5px] font-medium text-ink-3">Đơn {o + 1}</div>
                <div className="flex flex-wrap gap-1">
                  {items.map((it, id) => {
                    const on = order.includes(id);
                    return (
                      <button
                        key={id}
                        onClick={() => toggle(o, id)}
                        aria-pressed={on}
                        className={`rounded border px-1.5 py-0.5 transition-colors ${on ? "border-brand-500 bg-brand-50" : "border-line bg-surface opacity-60 hover:opacity-100"}`}
                      >
                        <ItemChip item={it} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <div>
          <h3 className="mb-1.5 text-xs font-semibold">1. Các luật khớp với lịch sử ({fired.length} / {story.rules.length})</h3>
          {fired.length === 0 ? (
            <Note tone="warn">Không luật nào khớp. Trên web thật, lúc này hệ thống phải gợi ý hàng bán chạy (hạn chế khởi đầu lạnh).</Note>
          ) : (
            <ul className="thin-scroll max-h-[260px] divide-y divide-line overflow-y-auto rounded-md border border-line">
              {fired.map((f, n) => (
                <li key={n} className="flex items-center justify-between gap-2 px-2.5 py-1.5" title={`${show(f.r.antecedent)} ⇒ ${items[f.r.consequent].label}`}>
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <Pat p={f.r.antecedent} items={items} />
                    <span className="text-xs text-ink-3">⇒</span>
                    <Pat p={[[f.r.consequent]]} items={items} tone="good" />
                  </span>
                  <span className="tabular shrink-0 text-right text-xs text-ink-2">
                    {pctText(f.r.confidence)}
                    {f.gap > 0 && <> × 0,85{f.gap > 1 ? <sup>{f.gap}</sup> : null}</>} = <b className="text-ink">{f.score.toFixed(2).replace(".", ",")}</b>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
            Điểm = confidence, nhân 0,85 cho mỗi đơn đã trôi qua kể từ lúc vế trái khớp: mua càng lâu thì ảnh hưởng càng yếu.
          </p>
        </div>
        <div>
          <h3 className="mb-1.5 text-xs font-semibold">2. Gợi ý cho khách (mỗi món lấy điểm cao nhất)</h3>
          {ranked.length === 0 ? (
            <p className="rounded-md bg-page px-3 py-6 text-center text-[12.5px] text-ink-3">Chưa có gợi ý.</p>
          ) : (
            <ol className="space-y-2">
              {ranked.map((f, n) => {
                const it = items[f.r.consequent];
                return (
                  <li key={f.r.consequent} className="fade-up flex items-center gap-3 rounded-md border border-line p-2">
                    <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{n + 1}</span>
                    {it.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image} alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-page font-mono text-lg font-semibold">{it.label}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold">{it.label}</div>
                      <div className="truncate text-[11.5px] text-ink-2">Vì khách đã mua {show(f.r.antecedent)}</div>
                    </div>
                    <span className="tabular shrink-0 text-sm font-semibold">{f.score.toFixed(2).replace(".", ",")}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
      <Note>
        Trang <Link href="/" className="font-medium underline">Cửa hàng</Link> làm đúng các bước này, chỉ khác quy mô: 3.959 khách, 300 sản phẩm, hơn 3.000 luật,
        và lấy 10 món đứng đầu.
      </Note>
    </>
  );
}
