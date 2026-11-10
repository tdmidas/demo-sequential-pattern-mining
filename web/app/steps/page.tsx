"use client";

import { Check, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ALGO_COLOR, ALGO_IDS, ALGO_NAME } from "@/components/charts";
import { useShop } from "@/components/shop-context";
import { DotField, type FieldSpec, SWEEP_MS, TONE, toneCss } from "@/components/steps/DotField";
import { Card, Note, PageTitle, Segmented, Spinner, fmt, fmtCompact, fmtDate, fmtMs, pct, shortName, titleCase } from "@/components/ui";
import type { Item } from "@/lib/data";
import type { ExplainResponse } from "@/lib/mining/explain-types";
import type { AlgorithmId, Pattern } from "@/lib/mining/types";

const STAGES = [
  { n: 1, label: "Dữ liệu" },
  { n: 2, label: "Khai thác mẫu" },
  { n: 3, label: "Sinh luật" },
  { n: 4, label: "Gợi ý" },
] as const;

type Scene =
  | { kind: "data" }
  | { kind: "gsp-gen"; k: number }
  | { kind: "gsp-count"; k: number }
  | { kind: "spade-vertical" }
  | { kind: "spade-join"; k: number }
  | { kind: "ps-root" }
  | { kind: "ps-project"; k: number }
  | { kind: "mined" }
  | { kind: "rule" }
  | { kind: "recommend" };

interface Frame {
  stage: 1 | 2 | 3 | 4;
  title: string;
  scene: Scene;
  /** Số bước của mẫu đã có support tính đến hết khung này. */
  revealed: number;
}

function buildFrames(x: ExplainResponse, algorithm: AlgorithmId): Frame[] {
  const frames: Frame[] = [{ stage: 1, title: "Dữ liệu", scene: { kind: "data" }, revealed: 0 }];
  x.chain.forEach((_, k) => {
    const level = k + 1;
    if (algorithm === "gsp") {
      frames.push({ stage: 2, title: `GSP · mức ${level} · lập ứng viên`, scene: { kind: "gsp-gen", k }, revealed: k });
      frames.push({ stage: 2, title: `GSP · mức ${level} · quét và đếm`, scene: { kind: "gsp-count", k }, revealed: k + 1 });
    } else if (algorithm === "spade") {
      frames.push(
        k === 0
          ? { stage: 2, title: "SPADE · lật dữ liệu thành danh sách", scene: { kind: "spade-vertical" }, revealed: 1 }
          : { stage: 2, title: `SPADE · ghép danh sách, mẫu dài ${level}`, scene: { kind: "spade-join", k }, revealed: k + 1 },
      );
    } else {
      frames.push(
        k === 0
          ? { stage: 2, title: "PrefixSpan · đếm từng sản phẩm", scene: { kind: "ps-root" }, revealed: 1 }
          : { stage: 2, title: `PrefixSpan · chiếu theo tiền tố dài ${k}`, scene: { kind: "ps-project", k }, revealed: k + 1 },
      );
    }
  });
  const n = x.chain.length;
  frames.push({ stage: 2, title: "Kết quả khai thác", scene: { kind: "mined" }, revealed: n });
  frames.push({ stage: 3, title: "Sinh luật", scene: { kind: "rule" }, revealed: n });
  frames.push({ stage: 4, title: "Chấm điểm và xếp hạng", scene: { kind: "recommend" }, revealed: n });
  return frames;
}

// ---------------------------------------------------------------------------
// Mỗi cảnh = một cách xếp và tô màu 3.959 chấm khách hàng + một dòng lời dẫn
// ---------------------------------------------------------------------------

interface Legend {
  key: string;
  tone: number;
  value: number;
  label: string;
  /** Đếm từ 0 theo nhịp của lượt quét. */
  sweep?: boolean;
}

interface View {
  caption: React.ReactNode;
  field: FieldSpec | null;
  legend: Legend[];
}

function buildView(scene: Scene, x: ExplainResponse, algorithm: AlgorithmId, who: string): View {
  const N = x.sequences;
  const chain = x.chain;
  const last = chain.length - 1;
  const tone = new Uint8Array(N);
  const paint = (sids: number[], t: number) => {
    for (const s of sids) tone[s] = t;
  };
  const inPlace = () => {
    const slot = new Int32Array(N);
    for (let i = 0; i < N; i++) slot[i] = i;
    return slot;
  };
  /** Gom chấm thành từng khối theo vai, vai đứng trước trong `order` nằm trên. */
  const grouped = (order: number[]) => {
    const rank = new Uint8Array(16).fill(15);
    order.forEach((t, i) => (rank[t] = i));
    const idx = Array.from({ length: N }, (_, i) => i).sort((p, q) => rank[tone[p]] - rank[tone[q]] || p - q);
    const slot = new Int32Array(N);
    idx.forEach((sid, pos) => (slot[sid] = pos));
    return slot;
  };
  const count = (t: number) => {
    let c = 0;
    for (let i = 0; i < N; i++) if (tone[i] === t) c++;
    return c;
  };
  const spec = (slot: Int32Array, labels: Record<number, string>, opt: { sweep?: boolean; late?: number[]; focus?: number } = {}): FieldSpec => ({
    slot,
    tone,
    sweep: opt.sweep ?? false,
    late: opt.late ?? [],
    focus: opt.focus,
    scan: ALGO_COLOR[algorithm],
    labels,
  });

  switch (scene.kind) {
    case "data":
      return {
        caption: (
          <>
            Mỗi chấm là <b>một khách thật</b>. Bao nhiêu người trong số họ mua đúng trình tự ở trên?
          </>
        ),
        field: spec(inPlace(), {}),
        legend: [{ key: "all", tone: TONE.idle, value: N, label: "khách, mỗi người là một chuỗi đơn hàng" }],
      };

    case "gsp-gen": {
      const level = scene.k + 1;
      const counted = chain[scene.k].gsp?.counted ?? 0;
      const f1 = chain[0].gsp?.frequent ?? 0;
      return {
        caption:
          level === 1 ? (
            <>
              GSP coi mỗi sản phẩm là một <b>ứng viên</b>: {fmt(counted)} ứng viên dài 1.
            </>
          ) : level === 2 ? (
            <>
              Ghép {fmt(f1)} sản phẩm phổ biến thành <b>mọi cặp có thể</b>: {fmt(counted)} ứng viên. Mẫu của ta là một trong số đó.
            </>
          ) : (
            <>
              Ghép các mẫu dài {level - 1} thành <b>{fmt(counted)} ứng viên</b> dài {level}. Mẫu của ta là một trong số đó.
            </>
          ),
        field: spec(inPlace(), { [TONE.idle]: "chờ quét" }),
        legend: [{ key: "all", tone: TONE.idle, value: N, label: "khách chờ được quét" }],
      };
    }

    case "gsp-count": {
      const st = chain[scene.k];
      tone.fill(TONE.miss);
      paint(st.sids, TONE.gsp);
      return {
        caption: (
          <>
            Lần quét thứ {scene.k + 1}: GSP dò lại <b>toàn bộ {fmt(N)} khách</b> để đếm từng ứng viên.
          </>
        ),
        field: spec(inPlace(), { [TONE.gsp]: "chứa mẫu", [TONE.miss]: "không chứa mẫu" }, { sweep: true }),
        legend: [
          { key: "hit", tone: TONE.gsp, value: st.support, label: "khách chứa mẫu", sweep: true },
          { key: "miss", tone: TONE.miss, value: N - st.support, label: "không chứa", sweep: true },
        ],
      };
    }

    case "spade-vertical": {
      const st = chain[0];
      tone.fill(TONE.out);
      paint(st.sids, TONE.a);
      return {
        caption: (
          <>
            SPADE quét <b>đúng một lần</b>, gom mỗi sản phẩm thành một danh sách “khách nào, đơn nào”.
          </>
        ),
        field: spec(grouped([TONE.a, TONE.out]), { [TONE.a]: "có trong danh sách", [TONE.out]: "không có trong danh sách" }),
        legend: [
          { key: "list", tone: TONE.a, value: st.vertical.customers, label: "khách có trong danh sách của món này" },
          { key: "out", tone: TONE.out, value: N - st.vertical.customers, label: "không có" },
        ],
      };
    }

    case "spade-join": {
      const st = chain[scene.k];
      const j = st.spade!;
      const kept = new Uint8Array(N);
      for (const s of st.sids) kept[s] = 1;
      const inB = new Uint8Array(N);
      for (const s of j.bSids) inB[s] = 1;
      tone.fill(TONE.out);
      paint(j.bSids, TONE.b);
      for (const s of chain[scene.k - 1].sids) tone[s] = kept[s] ? TONE.hit : inB[s] ? TONE.both : TONE.a;
      const temporal = j.join === "temporal";
      return {
        caption: (
          <>
            Không mở lại dữ liệu: chỉ <b>ghép hai danh sách</b>, giữ khách có {temporal ? "B nằm sau A" : "A và B trong cùng một đơn"}.
          </>
        ),
        field: spec(
          grouped([TONE.hit, TONE.both, TONE.a, TONE.b, TONE.out]),
          {
            [TONE.hit]: "ghép được",
            [TONE.both]: temporal ? "có cả hai nhưng B không nằm sau A" : "có cả hai nhưng không cùng đơn",
            [TONE.a]: "chỉ có trong A",
            [TONE.b]: "chỉ có trong B",
            [TONE.out]: "không có trong danh sách nào",
          },
          { late: [TONE.hit] },
        ),
        legend: [
          { key: "hit", tone: TONE.hit, value: count(TONE.hit), label: "ghép được" },
          { key: "both", tone: TONE.both, value: count(TONE.both), label: temporal ? "có cả hai, sai thứ tự" : "có cả hai, khác đơn" },
          { key: "a", tone: TONE.a, value: count(TONE.a), label: "chỉ có A" },
          { key: "b", tone: TONE.b, value: count(TONE.b), label: "chỉ có B" },
        ],
      };
    }

    case "ps-root": {
      const st = chain[0];
      tone.fill(TONE.miss);
      paint(st.sids, TONE.hit);
      return {
        caption: (
          <>
            PrefixSpan quét một lần và đếm từng sản phẩm. Món đạt ngưỡng trở thành <b>tiền tố</b>.
          </>
        ),
        field: spec(inPlace(), { [TONE.hit]: "đã mua món này", [TONE.miss]: "chưa mua món này" }, { sweep: true }),
        legend: [
          { key: "hit", tone: TONE.hit, value: st.support, label: "khách đã mua món này", sweep: true },
          { key: "miss", tone: TONE.miss, value: N - st.support, label: "chưa mua", sweep: true },
        ],
      };
    }

    case "ps-project": {
      const st = chain[scene.k];
      const projected = st.prefixspan.projected;
      tone.fill(TONE.out);
      paint(chain[scene.k - 1].sids, TONE.proj);
      paint(st.sids, TONE.hit);
      return {
        caption: (
          <>
            Dữ liệu <b>co lại còn {fmt(projected)} khách</b> có tiền tố. Chỉ đếm tiếp trong phần họ mua sau đó.
          </>
        ),
        field: spec(
          grouped([TONE.hit, TONE.proj, TONE.out]),
          { [TONE.hit]: "có món tiếp theo", [TONE.proj]: "có tiền tố, không có món này", [TONE.out]: "đã loại khỏi dữ liệu" },
          { late: [TONE.hit] },
        ),
        legend: [
          { key: "hit", tone: TONE.hit, value: st.support, label: "có món tiếp theo" },
          { key: "proj", tone: TONE.proj, value: projected - st.support, label: "có tiền tố, không có món này" },
          { key: "out", tone: TONE.out, value: N - projected, label: "đã loại" },
        ],
      };
    }

    case "mined": {
      const st = chain[last];
      const done = x.stats.filter((s) => !s.timedOut);
      const same = done.length >= 2 && done.every((s) => s.patterns === done[0].patterns);
      const t = algorithm === "gsp" ? TONE.gsp : TONE.hit;
      tone.fill(TONE.out);
      paint(st.sids, t);
      return {
        caption: same ? (
          <>
            Làm như vậy cho mọi mẫu: cả {done.length} thuật toán ra cùng <b>{fmt(done[0].patterns)} mẫu</b>, chỉ khác công sức.
          </>
        ) : (
          <>Làm như vậy cho mọi mẫu. Các thuật toán khác nhau ở công sức bỏ ra.</>
        ),
        field: spec(grouped([t, TONE.out]), { [t]: "chứa mẫu", [TONE.out]: "không chứa mẫu" }),
        legend: [
          { key: "hit", tone: t, value: st.support, label: "khách chứa mẫu đang lần theo" },
          { key: "min", tone: TONE.out, value: x.minSupport, label: "là ngưỡng cần đạt" },
        ],
      };
    }

    case "rule": {
      const rule = x.rule!;
      tone.fill(TONE.out);
      paint(chain[last - 1]?.sids ?? [], TONE.ant);
      paint(chain[last].sids, TONE.full);
      return {
        caption: (
          <>
Tách món cuối làm vế phải. Phóng to <b>{fmt(rule.antSupport)} khách</b> đã mua vế trái: <b>{fmt(rule.support)}</b> người mua tiếp món này.
          </>
        ),
        field: spec(
          grouped([TONE.full, TONE.ant, TONE.out]),
          { [TONE.full]: "mua vế trái rồi mua tiếp món này", [TONE.ant]: "mua vế trái, không mua tiếp", [TONE.out]: "chưa mua vế trái" },
          { late: [TONE.full], focus: rule.antSupport },
        ),
        legend: [
          { key: "full", tone: TONE.full, value: rule.support, label: "mua vế trái rồi mua tiếp" },
          { key: "ant", tone: TONE.ant, value: rule.antSupport - rule.support, label: "mua vế trái, không mua tiếp" },
        ],
      };
    }

    case "recommend":
      return {
        caption: (
          <>
            Lịch sử của {who} <b>khớp vế trái</b> của luật. Điểm = confidence × độ cũ, rồi xếp hạng.
          </>
        ),
        field: null,
        legend: [],
      };
  }
}

// ---------------------------------------------------------------------------
// Thành phần nhỏ
// ---------------------------------------------------------------------------

function Thumb({ item, size = 20, className = "" }: { item: Item; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (!item.image) return <span className={`inline-block shrink-0 rounded-sm bg-page ${className}`} style={style} title={titleCase(item.name)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={item.image} alt={titleCase(item.name)} title={titleCase(item.name)} className={`shrink-0 rounded-sm object-cover ${className}`} style={style} />;
}

function Arrow({ strong = false }: { strong?: boolean }) {
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" className={`shrink-0 transition-colors duration-500 ${strong ? "text-brand-600" : "text-ink-3"}`} aria-label="rồi">
      <path d="M0 5h15M12 1.5 15.5 5 12 8.5" fill="none" stroke="currentColor" strokeWidth={strong ? 2 : 1.3} />
    </svg>
  );
}

/** Mẫu chỉ bằng ảnh, dùng ở chỗ hẹp. */
function PatThumbs({ p, items, size = 22 }: { p: Pattern; items: Item[]; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {p.map((el, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <Arrow />}
          <span className="inline-flex items-center gap-0.5 rounded border border-line-strong bg-surface p-0.5">
            {el.map((id) => (
              <Thumb key={id} item={items[id]} size={size} />
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Số tự chạy từ giá trị đang hiện sang giá trị mới (không nhảy cóc giữa các bước). */
function Num({ value, from, ms = 800, delay = 0, linear = false, format = fmt }: { value: number; from?: number; ms?: number; delay?: number; linear?: boolean; format?: (v: number) => string }) {
  const [v, setV] = useState(from ?? value);
  const cur = useRef(from ?? value);
  useEffect(() => {
    const a = cur.current;
    if (a === value) return;
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / ms));
      cur.current = a + (value - a) * (linear ? p : 1 - Math.pow(1 - p, 3));
      setV(cur.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, delay, linear]);
  return <>{format(Math.round(v))}</>;
}

/** Thanh tự co giãn tới tỷ lệ mới. */
function Bar({ ratio, color, ms = 900, track = true }: { ratio: number; color: string; ms?: number; track?: boolean }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(ratio), 30);
    return () => clearTimeout(t);
  }, [ratio]);
  return (
    <div className={`h-2 w-full rounded-full ${track ? "bg-page" : ""}`}>
      <div className="h-2 rounded-full" style={{ width: `${Math.max(1, Math.min(1, w) * 100)}%`, background: color, transition: `width ${ms}ms cubic-bezier(.2,.7,.2,1), background-color 400ms` }} />
    </div>
  );
}

const comma = (v: number, digits = 2) => v.toFixed(digits).replace(".", ",");

// ---------------------------------------------------------------------------
// Trang
// ---------------------------------------------------------------------------

export default function StepsPage() {
  const { catalog, persona, history, settings } = useShop();
  const [algorithm, setAlgorithm] = useState<AlgorithmId>(settings.algorithm);
  const [picked, setPicked] = useState<number | null>(null);
  const [x, setX] = useState<ExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const historyKey = JSON.stringify(history.map((b) => b.items));
  useEffect(() => setPicked(null), [historyKey]);

  useEffect(() => {
    if (!catalog) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch("/api/explain", {
      method: "POST",
      signal: ctrl.signal,
      body: JSON.stringify({
        history: JSON.parse(historyKey),
        item: picked,
        minsupPct: settings.minsupPct,
        maxLength: settings.maxLength,
        minConfidence: settings.minConfidence,
        excludeBought: settings.excludeBought,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ExplainResponse) => {
        setX(d);
        setIndex(0);
        setPlaying(false);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        setError(String(e.message ?? e));
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [catalog, historyKey, picked, settings.minsupPct, settings.maxLength, settings.minConfidence, settings.excludeBought]);

  const who = persona ? `Khách #${persona.id}` : "Khách mới";
  const frames = useMemo(() => (x && x.rule ? buildFrames(x, algorithm) : []), [x, algorithm]);
  const last = frames.length - 1;
  const i = Math.max(0, Math.min(index, last));
  const frame = frames[i];
  const view = useMemo(() => (x && frame ? buildView(frame.scene, x, algorithm, who) : null), [x, frame, algorithm, who]);
  // Cảnh cuối không dùng lưới chấm: giữ nguyên lưới của cảnh trước để nó mờ dần thay vì biến mất.
  const [field, setField] = useState<FieldSpec | null>(null);
  useEffect(() => {
    if (view?.field) setField(view.field);
  }, [view]);

  const sweeping = frame?.scene.kind === "gsp-count" || frame?.scene.kind === "ps-root";
  useEffect(() => {
    if (!playing || !frame) return;
    if (i >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex(i + 1), sweeping ? 4600 : 3600);
    return () => clearTimeout(t);
  }, [playing, i, last, frame, sweeping]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT") return;
      if (e.key === "ArrowRight") setIndex((v) => Math.min(v + 1, last));
      if (e.key === "ArrowLeft") setIndex((v) => Math.max(v - 1, 0));
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  if (!catalog) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-ink-2">
        <Spinner /> Đang tải…
      </div>
    );
  }
  const items = catalog.items;
  const go = (n: number) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(last, n)));
  };

  return (
    <div>
      <PageTitle
        title="Minh hoạ: gợi ý này từ đâu ra?"
        lead={
          <>
Chọn một món đang được gợi ý cho {who}, bấm Tự phát. Đếm trên {fmt(catalog.sequences)} khách thật.{" "}
            <Link href="/steps/mini" className="font-medium text-brand-700 hover:underline">Ví dụ tí hon 4 khách</Link>
          </>
        }
      />

      {error && <Note tone="warn">Không tải được dữ liệu minh hoạ: {error}</Note>}
      {!x && loading && (
        <Card className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-ink-2">
          <Spinner /> Đang chạy cả ba thuật toán trên dữ liệu thật (lần đầu mất khoảng 10 giây)…
        </Card>
      )}

      {x && (
        <>
          <Card className="mb-4">
            <div className="thin-scroll flex gap-2 overflow-x-auto p-2.5">
              {x.ranking.map((r, n) => {
                const it = items[r.item];
                const usable = r.why.type === "sequential";
                const on = x.item === r.item;
                return (
                  <button
                    key={r.item}
                    disabled={!usable}
                    onClick={() => setPicked(r.item)}
                    aria-pressed={on}
                    title={usable ? titleCase(it.name) : "Món này lấy từ danh sách bán chạy, không đến từ luật nào"}
                    className={`relative min-w-[96px] flex-1 overflow-hidden rounded-md border text-left transition-all duration-300 ${
                      on ? "border-brand-600 ring-2 ring-brand-500" : "border-line hover:shadow-md"
                    } ${usable ? "" : "opacity-45"}`}
                  >
                    {it.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image} alt="" className="h-12 w-full object-cover" />
                    ) : (
                      <div className="h-12 w-full bg-page" />
                    )}
                    <span className="tabular absolute left-0 top-0 rounded-br bg-ink/75 px-1.5 py-0.5 text-[10.5px] font-semibold text-white">#{n + 1}</span>
                    <div className="truncate px-1.5 py-1 text-[11px] font-medium leading-tight">{titleCase(it.name)}</div>
                  </button>
                );
              })}
              {loading && <Spinner className="m-auto !h-4 !w-4 shrink-0" />}
            </div>
          </Card>

          {!x.rule || !frame || !view ? (
            <Note tone="warn" title="Không có gợi ý nào đến từ luật tuần tự">
              {history.length === 0
                ? "Khách này chưa có đơn hàng nào nên không luật nào khớp; mọi gợi ý đều lấy từ danh sách bán chạy (khởi đầu lạnh). Hãy chọn một tài khoản khác ở góc trên, hoặc đặt một đơn ở trang Cửa hàng."
                : "Không luật nào khớp với lịch sử của khách ở ngưỡng minsup hiện tại."}
            </Note>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
              <HistoryCard who={who} history={history} items={items} matched={frame.stage === 4 ? x.matched : []} antecedent={x.rule.antecedent} />

              <Card className="self-start overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5">
                  <Segmented
                    value={algorithm}
                    onChange={(v) => {
                      setAlgorithm(v);
                      setIndex(frames.findIndex((f) => f.stage === 2));
                      setPlaying(false);
                    }}
                    options={ALGO_IDS.map((id) => ({ value: id, label: ALGO_NAME[id] }))}
                  />
                  <ol className="flex items-center gap-0.5" aria-label="Các chặng">
                    {STAGES.map((s) => {
                      const state = frame.stage === s.n ? "now" : frame.stage > s.n ? "done" : "todo";
                      return (
                        <li key={s.n} className="flex items-center gap-0.5">
                          {s.n > 1 && <span className={`h-px w-3 transition-colors duration-500 ${state === "todo" ? "bg-line-strong" : "bg-good"}`} />}
                          <button
                            onClick={() => go(frames.findIndex((f) => f.stage === s.n))}
                            aria-current={state === "now" ? "step" : undefined}
                            className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[12.5px] font-medium transition-colors duration-300 ${
                              state === "now" ? "bg-brand-50 text-brand-800" : state === "done" ? "text-ink hover:bg-page" : "text-ink-3 hover:bg-page"
                            }`}
                          >
                            <span
                              className={`tabular flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold transition-colors duration-300 ${
                                state === "now" ? "bg-brand-600 text-white" : state === "done" ? "bg-good text-white" : "bg-page text-ink-3 ring-1 ring-line-strong"
                              }`}
                            >
                              {state === "done" ? <Check className="h-3 w-3" /> : s.n}
                            </span>
                            {s.label}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="ml-auto flex items-center gap-1.5">
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
                    <button onClick={() => go(i - 1)} disabled={i === 0} aria-label="Bước trước" title="Bước trước (←)" className="flex h-8 w-8 items-center justify-center rounded-md border border-line-strong hover:border-brand-500 disabled:opacity-40">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button onClick={() => go(i + 1)} disabled={i === last} aria-label="Bước sau" title="Bước sau (→)" className="flex h-8 w-8 items-center justify-center rounded-md border border-line-strong hover:border-brand-500 disabled:opacity-40">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-1 px-4 pt-3" role="group" aria-label="Vị trí trong minh hoạ">
                  {frames.map((f, n) => (
                    <button key={n} onClick={() => go(n)} title={f.title} aria-label={`Bước ${n + 1}: ${f.title}`} className="group h-3 flex-1">
                      <span className={`block h-1 rounded-full transition-colors duration-500 group-hover:h-1.5 ${n <= i ? "bg-brand-600" : "bg-line"}`} />
                    </button>
                  ))}
                </div>

                <PatternBar x={x} items={items} revealed={frame.revealed} active={frame.scene.kind === "gsp-gen" ? frame.scene.k : -1} asRule={frame.stage >= 3} />

                <div className="min-h-[58px] px-4 pt-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full transition-colors duration-500" style={{ background: frame.stage === 2 ? ALGO_COLOR[algorithm] : "#1a56c9" }} />
                    <h2 className="tabular truncate text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
                      {i + 1}/{last + 1} · {frame.title}
                    </h2>
                  </div>
                  <p key={`${x.item}-${algorithm}-${i}`} className="fade-in mt-1 text-[14.5px] leading-snug text-ink">
                    {view.caption}
                  </p>
                </div>

                <div className="relative px-4 pb-4 pt-3">
                  <div className={`grid gap-5 transition-opacity duration-500 lg:grid-cols-[minmax(0,1fr)_272px] ${view.field ? "" : "pointer-events-none opacity-0"}`}>
                    <div>
                      <LegendRow legend={view.legend} />
                      {field && <DotField spec={field} ids={x.ids} height={300} />}
                    </div>
                    <div key={sideKey(frame.scene)} className="fade-in min-w-0">
                      <Side scene={frame.scene} x={x} items={items} algorithm={algorithm} />
                    </div>
                  </div>
                  <div className={`absolute inset-x-4 bottom-4 top-3 transition-opacity duration-500 ${view.field ? "pointer-events-none opacity-0" : ""}`}>
                    {frame.scene.kind === "recommend" && <RecommendPanel x={x} items={items} />}
                  </div>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Các cảnh cùng họ dùng chung một khung bên phải, nhờ đó số và thanh trượt tiếp thay vì vẽ lại. */
function sideKey(scene: Scene): string {
  if (scene.kind === "gsp-gen" || scene.kind === "gsp-count") return "gsp";
  if (scene.kind === "ps-root" || scene.kind === "ps-project") return "ps";
  return scene.kind;
}

// ---------------------------------------------------------------------------
// Mẫu đang lần theo: luôn nằm trên cùng, sáng dần theo từng bước
// ---------------------------------------------------------------------------

function PatternBar({ x, items, revealed, active, asRule }: { x: ExplainResponse; items: Item[]; revealed: number; active: number; asRule: boolean }) {
  const full = x.chain[x.chain.length - 1].pattern;
  let k = -1;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 pb-3 pt-2">
      <span className="text-xs font-medium text-ink-2">Mẫu đang lần theo</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {full.map((el, e) => {
          const lastEl = e === full.length - 1;
          return (
            <div key={e} className="flex items-center gap-1.5">
              {e > 0 && <Arrow strong={asRule && lastEl} />}
              <div className="flex items-center gap-1">
                {el.map((id, j) => {
                  k++;
                  const step = x.chain[k];
                  const done = k < revealed;
                  const now = k === active;
                  const rhs = asRule && lastEl;
                  return (
                    <div key={id} className="flex items-center gap-1">
                      {j > 0 && <span className="text-sm text-ink-3">+</span>}
                      <div
                        className={`flex items-center gap-2 rounded-lg border py-1 pl-1 pr-2.5 transition-all duration-500 ${
                          rhs
                            ? "border-brand-500 bg-brand-50"
                            : done
                              ? "border-[#9fd8bf] bg-good-soft"
                              : now
                                ? "soft-pulse border-brand-500 bg-surface"
                                : "border-dashed border-line-strong bg-surface opacity-55"
                        }`}
                      >
                        <Thumb item={items[id]} size={32} className="rounded" />
                        <div className="min-w-0 leading-tight">
                          <div className="max-w-[150px] truncate text-[12px] font-medium">{shortName(items[id], 22)}</div>
                          <div className={`tabular text-[11px] transition-colors duration-500 ${done ? (rhs ? "text-brand-700" : "text-good") : "text-ink-3"}`}>
                            {done ? (
                              <>
                                <b><Num value={step.support} from={0} ms={900} /></b> khách
                              </>
                            ) : now ? (
                              "đang đếm…"
                            ) : (
                              "chưa đếm"
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <span className="tabular ml-auto text-xs text-ink-2">
        cần ≥ <b className="text-ink">{fmt(x.minSupport)}</b> khách ({String(x.minsupPct).replace(".", ",")}%)
      </span>
    </div>
  );
}

function LegendRow({ legend }: { legend: Legend[] }) {
  return (
    <div className="mb-2.5 flex min-h-[26px] flex-wrap items-center gap-x-5 gap-y-1.5">
      {legend.map((l) => (
        <div key={l.key} className="fade-in flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full transition-colors duration-500" style={{ background: toneCss(l.tone) }} />
          <span className="tabular text-[17px] font-semibold leading-none">
            {l.sweep ? <Num value={l.value} from={0} ms={SWEEP_MS} delay={150} linear /> : <Num value={l.value} />}
          </span>
          <span className="text-[12px] text-ink-2">{l.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cột trái: lịch sử của khách bằng ảnh
// ---------------------------------------------------------------------------

function HistoryCard({ who, history, items, matched, antecedent }: { who: string; history: { date: string; items: number[] }[]; items: Item[]; matched: number[]; antecedent: Pattern }) {
  const box = useRef<HTMLOListElement>(null);
  const first = matched[0];
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const target = first === undefined ? null : (el.children[first] as HTMLElement | undefined);
    el.scrollTo({ top: target ? Math.max(0, target.offsetTop - el.offsetTop - 8) : el.scrollHeight, behavior: "smooth" });
  }, [first, history.length]);
  return (
    <Card className="self-start">
      <header className="flex items-baseline justify-between border-b border-line px-3.5 py-2.5">
        <h2 className="text-[13px] font-semibold">Lịch sử của {who}</h2>
        <span className="tabular text-xs text-ink-2">{history.length} đơn</span>
      </header>
      <ol ref={box} className="thin-scroll relative max-h-[520px] overflow-y-auto">
        {history.map((b, n) => {
          const at = matched.indexOf(n);
          const hot = at >= 0 ? antecedent[at] ?? [] : [];
          const shown = [...hot.filter((id) => b.items.includes(id)), ...b.items.filter((id) => !hot.includes(id))].slice(0, 12);
          return (
            <li key={n} className={`border-b border-line px-3.5 py-2 transition-colors duration-500 last:border-b-0 ${at >= 0 ? "bg-brand-50 shadow-[inset_3px_0_0_var(--color-brand-600)]" : ""}`}>
              <div className="tabular flex items-center gap-1.5 text-[11.5px] text-ink-2">
                <span className={`font-semibold ${at >= 0 ? "text-brand-700" : "text-ink"}`}>Đơn {n + 1}</span>
                <span>{fmtDate(b.date)}</span>
                {at >= 0 && <span className="fade-in ml-auto rounded bg-brand-600 px-1 text-[10px] font-semibold text-white">khớp</span>}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {shown.map((id) => (
                  <Thumb key={id} item={items[id]} size={26} className={`transition-all duration-500 ${hot.includes(id) ? "ring-2 ring-brand-600 ring-offset-1" : at >= 0 ? "opacity-45" : ""}`} />
                ))}
                {b.items.length > shown.length && <span className="tabular self-center text-[11px] text-ink-3">+{b.items.length - shown.length}</span>}
              </div>
            </li>
          );
        })}
        {history.length > 0 && (
          <li className="border-t border-dashed border-line-strong px-3.5 py-2 text-[11.5px] text-ink-3">Đơn kế tiếp: cần gợi ý</li>
        )}
      </ol>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Khung bên phải của từng cảnh
// ---------------------------------------------------------------------------

function SideTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{children}</h3>;
}

function Side({ scene, x, items, algorithm }: { scene: Scene; x: ExplainResponse; items: Item[]; algorithm: AlgorithmId }) {
  const N = x.sequences;

  if (scene.kind === "data") {
    return (
      <div className="space-y-2.5">
        <SideTitle>Dữ liệu đầu vào</SideTitle>
        {[
          { v: fmt(N), l: "khách hàng" },
          { v: fmt(x.nItems), l: "sản phẩm" },
          { v: `≥ ${fmt(x.minSupport)}`, l: `khách thì gọi là phổ biến (${String(x.minsupPct).replace(".", ",")}%)` },
        ].map((t) => (
          <div key={t.l} className="rounded-md border border-line px-3 py-2.5">
            <div className="tabular text-[22px] font-semibold leading-none">{t.v}</div>
            <div className="mt-1 text-[12px] text-ink-2">{t.l}</div>
          </div>
        ))}
      </div>
    );
  }

  if (scene.kind === "gsp-gen" || scene.kind === "gsp-count") {
    const counting = scene.kind === "gsp-count";
    const levels = x.chain.slice(0, scene.k + 1).map((st, k) => ({ k, counted: st.gsp?.counted ?? 0, frequent: st.gsp?.frequent ?? 0, known: k < scene.k || counting }));
    const max = Math.max(...levels.map((l) => l.counted), 1);
    const scans = scene.k + (counting ? 1 : 0);
    return (
      <div>
        <SideTitle>Ứng viên phải đem đi đếm</SideTitle>
        <div className="space-y-3">
          {levels.map((l) => (
            <div key={l.k} className="fade-in">
              <div className="tabular flex items-baseline justify-between text-[12px] text-ink-2">
                <span>Mức {l.k + 1}</span>
                <span className="text-[17px] font-semibold leading-none text-ink">
                  <Num value={l.counted} from={0} ms={1100} />
                </span>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-page">
                <div className="absolute inset-y-0 left-0 rounded-full bg-line-strong transition-[width] duration-1000" style={{ width: `${Math.max(1.5, (l.counted / max) * 100)}%` }} />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gsp transition-[width] duration-1000"
                  style={{ width: l.known ? `${Math.max(1.5, (l.frequent / max) * 100)}%` : "0%", transitionDelay: counting && l.k === scene.k ? `${SWEEP_MS}ms` : "0ms" }}
                />
              </div>
              <div className={`tabular mt-1 text-[11.5px] transition-opacity duration-500 ${l.known ? "text-ink-2" : "opacity-0"}`} style={{ transitionDelay: counting && l.k === scene.k ? `${SWEEP_MS}ms` : "0ms" }}>
                giữ lại <b className="text-gsp">{fmt(l.frequent)}</b> ({pct(l.frequent / Math.max(1, l.counted))}), bỏ {fmt(l.counted - l.frequent)}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-[12px] text-ink-2">
          <span>Số lần quét toàn bộ dữ liệu</span>
          <span className="ml-auto flex gap-1">
            {x.chain.map((_, k) => (
              <span key={k} className={`h-2.5 w-2.5 rounded-full transition-colors duration-500 ${k < scans ? "bg-gsp" : "bg-line"}`} />
            ))}
          </span>
          <b className="tabular text-ink">{scans}</b>
        </div>
      </div>
    );
  }

  if (scene.kind === "spade-vertical") {
    const st = x.chain[0];
    const rows = st.hits.flatMap((h) => h.pos.map((e) => ({ c: h.customer, e }))).slice(0, 6);
    return (
      <div>
        <SideTitle>Danh sách của món này</SideTitle>
        <div className="overflow-hidden rounded-md border border-line">
          <div className="flex items-center gap-2 border-b border-line bg-page/60 px-2.5 py-1.5">
            <Thumb item={items[st.item]} size={24} />
            <span className="truncate text-[12px] font-medium">{shortName(items[st.item], 24)}</span>
          </div>
          <table className="tabular w-full text-[12px]">
            <thead>
              <tr className="text-left text-[11px] text-ink-3">
                <th className="px-2.5 py-1 font-medium">Khách</th>
                <th className="px-2.5 py-1 font-medium">Mua ở đơn thứ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, n) => (
                <tr key={n} className="fade-in border-t border-line" style={{ animationDelay: `${n * 90}ms` }}>
                  <td className="px-2.5 py-1 font-medium">#{r.c}</td>
                  <td className="px-2.5 py-1">{r.e + 1}</td>
                </tr>
              ))}
              <tr className="border-t border-line text-ink-3">
                <td colSpan={2} className="px-2.5 py-1">… còn {fmt(Math.max(0, st.vertical.rows - rows.length))} dòng</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="tabular mt-3 text-[12px] text-ink-2">
          <b className="text-ink">{fmt(x.nItems)}</b> danh sách như vậy, giữ trong bộ nhớ.
        </p>
      </div>
    );
  }

  if (scene.kind === "spade-join") {
    const st = x.chain[scene.k];
    const j = st.spade!;
    const lists = [
      { tag: "A", p: j.a, customers: j.aCustomers, color: toneCss(TONE.a) },
      { tag: "B", p: j.b, customers: j.bCustomers, color: toneCss(TONE.b) },
      { tag: "=", p: st.pattern, customers: j.customers, color: toneCss(TONE.hit) },
    ];
    return (
      <div>
        <SideTitle>Ghép {j.join === "temporal" ? "trước–sau" : "cùng đơn"}</SideTitle>
        <div className="space-y-1.5">
          {lists.map((l) => (
            <div key={l.tag} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${l.tag === "=" ? "border-[#9fd8bf] bg-good-soft/60" : "border-line"}`}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: l.color }}>{l.tag}</span>
              <PatThumbs p={l.p} items={items} size={20} />
              <span className="tabular ml-auto text-[14px] font-semibold">
                <Num value={l.customers} />
              </span>
            </div>
          ))}
        </div>
        <table className="tabular mt-3 w-full text-[12px]">
          <thead>
            <tr className="text-left text-[11px] text-ink-3">
              <th className="py-1 font-medium">Khách</th>
              <th className="px-1 py-1 font-medium">A ở đơn</th>
              <th className="px-1 py-1 font-medium">B ở đơn</th>
              <th className="w-5" />
            </tr>
          </thead>
          <tbody>
            {j.sample.slice(0, 5).map((r, n) => (
              <tr key={r.customer} className="fade-in border-t border-line" style={{ animationDelay: `${n * 90}ms` }}>
                <td className="py-1 font-medium">#{r.customer}</td>
                <td className="px-1 py-1">{r.a.length ? r.a.map((e) => e + 1).join(", ") : "–"}</td>
                <td className="px-1 py-1">
                  {r.b.length
                    ? r.b.map((e, m) => (
                        <span key={m} className={r.kept.includes(e) ? "font-semibold text-good" : "text-ink-3"}>
                          {m > 0 ? ", " : ""}
                          {e + 1}
                        </span>
                      ))
                    : "–"}
                </td>
                <td className="py-1">{r.kept.length ? <Check className="h-3.5 w-3.5 text-good" aria-label="giữ" /> : <X className="h-3.5 w-3.5 text-ink-3" aria-label="loại" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (scene.kind === "ps-root" || scene.kind === "ps-project") {
    const k = scene.kind === "ps-root" ? 0 : scene.k;
    const st = x.chain[k];
    const ps = st.prefixspan;
    const has = ps.top.some((t) => t.item === ps.target.item && t.kind === ps.target.kind);
    const rows = (has ? ps.top : [...ps.top.slice(0, 5), ps.target]).slice(0, 6);
    const max = rows[0]?.support ?? 1;
    return (
      <div>
        <SideTitle>Dữ liệu phải xem</SideTitle>
        <div className="tabular flex items-baseline gap-1.5">
          <span className="text-[22px] font-semibold leading-none">
            <Num value={ps.projected} />
          </span>
          <span className="text-[12px] text-ink-2">/ {fmt(N)} khách</span>
          <span className="ml-auto text-[12px] font-semibold text-prefixspan">{pct(ps.projected / N)}</span>
        </div>
        <div className="mt-1.5">
          <Bar ratio={ps.projected / N} color={ALGO_COLOR.prefixspan} />
        </div>
        <div className="mt-4">
          <SideTitle>{k === 0 ? "Món nhiều khách mua nhất" : "Món hay được mua sau đó"}</SideTitle>
          <div className="space-y-2">
            {rows.map((r) => {
              const mine = r.item === ps.target.item && r.kind === ps.target.kind;
              return (
                <div key={`${k}-${r.kind}${r.item}`} className="fade-in">
                  <div className="flex items-center gap-1.5">
                    <Thumb item={items[r.item]} size={18} />
                    <span className={`min-w-0 flex-1 truncate text-[12px] ${mine ? "font-semibold" : ""}`}>{shortName(items[r.item], 22)}</span>
                    {k > 0 && r.kind === "i" && <span className="text-[10px] text-ink-3">cùng đơn</span>}
                    <span className={`tabular text-[12px] ${mine ? "font-semibold text-good" : "text-ink-2"}`}>{fmt(r.support)}</span>
                  </div>
                  <div className="mt-1">
                    <Bar ratio={r.support / max} color={mine ? ALGO_COLOR.prefixspan : "#cfd5de"} track={false} />
                  </div>
                </div>
              );
            })}
          </div>
          {!has && <p className="tabular mt-2 text-[11.5px] text-ink-3">Món của ta xếp hạng {ps.target.rank} / {fmt(ps.distinct)}.</p>}
        </div>
      </div>
    );
  }

  if (scene.kind === "mined") {
    const maxT = Math.max(...x.stats.map((s) => s.timeMs), 1);
    const maxC = Math.max(...x.stats.map((s) => s.counted), 1);
    return (
      <div>
        <SideTitle>Công sức cho mọi mẫu</SideTitle>
        <div className="space-y-2">
          {x.stats.map((s) => (
            <div key={s.algorithm} className={`rounded-md border px-2.5 py-2 transition-colors duration-500 ${s.algorithm === algorithm ? "border-brand-200 bg-brand-50/60" : "border-line"}`}>
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                <span className="h-2 w-2 rounded-full" style={{ background: ALGO_COLOR[s.algorithm] }} />
                {ALGO_NAME[s.algorithm]}
                <span className="tabular ml-auto">{fmtMs(s.timeMs)}</span>
              </div>
              <div className="mt-1.5">
                <Bar ratio={s.timeMs / maxT} color={ALGO_COLOR[s.algorithm]} />
              </div>
              <div className="tabular mt-1.5 flex items-center gap-2 text-[11.5px] text-ink-2">
                <span className="w-16 shrink-0">đếm {fmtCompact(s.counted)}</span>
                <Bar ratio={s.counted / maxC} color="#aeb7c4" />
                <span className="shrink-0">quét {s.dbScans}×</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (scene.kind === "rule") {
    const rule = x.rule!;
    return (
      <div>
        <SideTitle>Độ tin cậy của luật</SideTitle>
        <div className="tabular flex items-center gap-2.5">
          <div className="text-center leading-tight">
            <div className="text-[19px] font-semibold" style={{ color: toneCss(TONE.full) }}>
              <Num value={rule.support} from={0} ms={1200} delay={900} />
            </div>
            <div className="my-0.5 h-px bg-ink-3" />
            <div className="text-[19px] font-semibold text-ink-2">{fmt(rule.antSupport)}</div>
          </div>
          <span className="text-lg text-ink-3">=</span>
          <div className="text-[30px] font-semibold leading-none text-brand-700">
            <Num value={Math.round(rule.confidence * 1000)} from={0} ms={1200} delay={900} format={(v) => `${comma(v / 10, 1)}%`} />
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full" style={{ background: toneCss(TONE.ant) }}>
          <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: `${rule.confidence * 100}%`, background: toneCss(TONE.full) }} />
        </div>
        <div className="mt-4 rounded-md border border-line px-3 py-2.5">
          <div className="tabular text-[19px] font-semibold leading-none">× {comma(rule.lift)}</div>
          <div className="tabular mt-1 text-[12px] text-ink-2">so với mức chung: chỉ {pct(rule.consSupport / N)} khách mua món này (lift)</div>
        </div>
      </div>
    );
  }

  return null;
}

function RecommendPanel({ x, items }: { x: ExplainResponse; items: Item[] }) {
  const rule = x.rule!;
  const maxScore = x.ranking[0]?.score ?? 1;
  const parts = [
    { v: pct(rule.confidence), l: "confidence" },
    { op: "×" },
    { v: rule.gap === 0 ? "1" : `0,85${rule.gap > 1 ? `^${rule.gap}` : ""}`, l: rule.gap === 0 ? "khớp ở đơn mới nhất" : `khớp cách đây ${rule.gap} đơn` },
    { op: "=" },
    { v: comma(rule.score, 3), l: "điểm", strong: true },
  ];
  return (
    <div className="fade-in flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2.5">
        {parts.map((p, n) =>
          p.op ? (
            <span key={n} className="text-lg text-ink-3">{p.op}</span>
          ) : (
            <div key={n} className={`fade-in rounded-md border px-3 py-1.5 ${p.strong ? "border-brand-500 bg-brand-50" : "border-line"}`} style={{ animationDelay: `${n * 160}ms` }}>
              <div className={`tabular text-[18px] font-semibold leading-tight ${p.strong ? "text-brand-700" : ""}`}>{p.v}</div>
              <div className="text-[11px] text-ink-2">{p.l}</div>
            </div>
          ),
        )}
        <span className="ml-auto text-[12px] text-ink-2">Xếp hạng dưới đây chính là 10 món trên trang Cửa hàng</span>
      </div>
      <ol className="mt-3 grid flex-1 content-between">
        {x.ranking.map((r, n) => {
          const on = r.item === x.item;
          return (
            <li
              key={r.item}
              className={`fade-up grid grid-cols-[18px_24px_minmax(0,230px)_minmax(40px,1fr)_42px] items-center gap-2.5 rounded px-1.5 py-[2px] ${on ? "bg-brand-50 ring-1 ring-brand-200" : ""}`}
              style={{ animationDelay: `${500 + n * 70}ms` }}
            >
              <span className="tabular text-xs font-semibold text-ink-2">{n + 1}</span>
              <Thumb item={items[r.item]} size={24} />
              <span className={`truncate text-[12.5px] ${on ? "font-semibold" : ""}`}>{titleCase(items[r.item].name)}</span>
              <Bar ratio={r.score / maxScore} color={on ? "#1a56c9" : r.fallback ? "#dfe3ea" : "#b9d0fb"} ms={900} track={false} />
              <span className="tabular text-right text-xs font-semibold">{comma(r.score)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
