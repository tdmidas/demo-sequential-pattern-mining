"use client";

import { useEffect, useRef, useState } from "react";

/** Vai của một khách (một chấm) trong cảnh hiện tại. */
export const TONE = {
  idle: 0, // chưa được xét
  miss: 1, // đã xét, không chứa mẫu
  out: 2, // nằm ngoài phần dữ liệu đang dùng
  gsp: 3,
  a: 4, // SPADE: chỉ có trong danh sách A
  b: 5, // SPADE: chỉ có trong danh sách B
  hit: 6, // chứa mẫu
  proj: 7, // PrefixSpan: có tiền tố nhưng không có món tiếp theo
  ant: 8, // luật: khớp vế trái, không mua vế phải
  full: 9, // luật: khớp cả hai vế
  both: 10, // SPADE: có cả A lẫn B nhưng không ghép được
} as const;

// r, g, b, tỷ lệ kích thước
const RGBS: readonly (readonly [number, number, number, number])[] = [
  [174, 183, 196, 1],
  [221, 226, 233, 0.8],
  [214, 220, 228, 0.42],
  [42, 120, 214, 1],
  [235, 104, 52, 1],
  [122, 90, 240, 1],
  [22, 163, 112, 1],
  [163, 219, 195, 1],
  [169, 196, 247, 1],
  [26, 86, 201, 1],
  [222, 176, 74, 1],
];

export const toneCss = (t: number) => `rgb(${RGBS[t][0]},${RGBS[t][1]},${RGBS[t][2]})`;

export interface FieldSpec {
  /** slot[sid] = vị trí của khách sid trên lưới (0 là ô trên cùng bên trái). */
  slot: Int32Array;
  tone: Uint8Array;
  /** Đổi màu lần lượt từ trên xuống, như một lượt quét dữ liệu. */
  sweep: boolean;
  /** Các vai chỉ hiện màu sau khi chấm đã về chỗ. */
  late: number[];
  /** Nếu có: chỉ `focus` chấm đầu tiên được giữ lại và phóng to cho đầy khung, phần còn lại thu về 0. */
  focus?: number;
  /** Màu vạch quét. */
  scan: string;
  labels: Record<number, string>;
}

export const SWEEP_MS = 1900;
const POS_MS = 950;
const COL_MS = 380;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

interface Engine {
  retarget: (spec: FieldSpec, animate: boolean) => void;
  pick: (mx: number, my: number) => { sid: number; x: number; y: number } | null;
}

/**
 * Mỗi khách là một chấm. Khi cảnh đổi, chấm tự trượt về vị trí mới và đổi màu dần,
 * nên người xem thấy được dữ liệu "biến hình" thay vì bị thay bằng một hình khác.
 */
export function DotField({ spec, ids, height = 320 }: { spec: FieldSpec; ids: number[]; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const latest = useRef(spec);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const n = spec.slot.length;

  useEffect(() => {
    const el = wrap.current;
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!el || !cv || !ctx) return;

    const cur = new Float32Array(n * 6); // x, y, r, g, b, scale
    const from = new Float32Array(n * 6);
    const to = new Float32Array(n * 6);
    const delay = new Float32Array(n * 2); // trễ vị trí, trễ màu
    const inv = new Int32Array(n);
    let cols = 1;
    let rows = 1;
    let pitch = 1;
    let width = 0;
    let t0 = 0;
    let total = 0;
    let sweepBase = -1;
    let raf = 0;
    let active = latest.current;
    // lưới đang dùng để dò chấm dưới con trỏ (đổi khi phóng to)
    let hitCols = 1;
    let hitPitch = 1;
    let hitCount = n;

    const measure = () => {
      width = el.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(width * dpr);
      cv.height = Math.round(height * dpr);
      cv.style.width = `${width}px`;
      cv.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let c = Math.max(1, Math.ceil(Math.sqrt((n * width) / height)));
      while (Math.ceil(n / c) * (width / c) > height) c++;
      cols = c;
      rows = Math.ceil(n / c);
      pitch = width / c;
    };

    const fill = (spec: FieldSpec) => {
      const focus = spec.focus && spec.focus > 0 && spec.focus < n ? spec.focus : 0;
      let fc = cols;
      let fp = pitch;
      if (focus) {
        fc = Math.max(1, Math.ceil(Math.sqrt((focus * width) / height)));
        while (Math.ceil(focus / fc) * (width / fc) > height) fc++;
        fp = width / fc;
        if (fp > 20) {
          fp = 20;
          fc = Math.floor(width / fp);
        }
      }
      const grow = Math.min(7, fp * 0.37) / Math.min(4.2, pitch * 0.37);
      hitCols = fc;
      hitPitch = fp;
      hitCount = focus || n;
      for (let sid = 0; sid < n; sid++) {
        const s = spec.slot[sid];
        const o = sid * 6;
        const c = RGBS[spec.tone[sid]];
        const near = focus > 0 && s < focus;
        to[o] = near ? ((s % fc) + 0.5) * fp : ((s % cols) + 0.5) * pitch;
        to[o + 1] = near ? (Math.floor(s / fc) + 0.5) * fp : (Math.floor(s / cols) + 0.5) * pitch;
        to[o + 2] = c[0];
        to[o + 3] = c[1];
        to[o + 4] = c[2];
        to[o + 5] = focus ? (near ? c[3] * grow : 0) : c[3];
        inv[s] = sid;
      }
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      const base = Math.min(4.2, pitch * 0.37);
      for (let sid = 0; sid < n; sid++) {
        const o = sid * 6;
        if (cur[o + 5] < 0.03) continue;
        ctx.fillStyle = `rgb(${cur[o + 2] | 0},${cur[o + 3] | 0},${cur[o + 4] | 0})`;
        ctx.beginPath();
        ctx.arc(cur[o], cur[o + 1], base * cur[o + 5], 0, 6.2832);
        ctx.fill();
      }
      if (sweepBase >= 0) {
        const p = (t - sweepBase) / SWEEP_MS;
        if (p > 0 && p < 1) {
          const y = p * rows * pitch;
          const g = ctx.createLinearGradient(0, y - 28, 0, y);
          g.addColorStop(0, "rgba(255,255,255,0)");
          g.addColorStop(1, active.scan + "33");
          ctx.fillStyle = g;
          ctx.fillRect(0, y - 28, width, 28);
          ctx.fillStyle = active.scan;
          ctx.fillRect(0, y, width, 1.5);
        }
      }
    };

    const loop = (now: number) => {
      const t = now - t0;
      for (let sid = 0; sid < n; sid++) {
        const o = sid * 6;
        const p = easeInOut(clamp01((t - delay[sid * 2]) / POS_MS));
        const q = clamp01((t - delay[sid * 2 + 1]) / COL_MS);
        cur[o] = from[o] + (to[o] - from[o]) * p;
        cur[o + 1] = from[o + 1] + (to[o + 1] - from[o + 1]) * p;
        cur[o + 2] = from[o + 2] + (to[o + 2] - from[o + 2]) * q;
        cur[o + 3] = from[o + 3] + (to[o + 3] - from[o + 3]) * q;
        cur[o + 4] = from[o + 4] + (to[o + 4] - from[o + 4]) * q;
        cur[o + 5] = from[o + 5] + (to[o + 5] - from[o + 5]) * q;
      }
      draw(t);
      if (t < total) raf = requestAnimationFrame(loop);
      else {
        raf = 0;
        sweepBase = -1;
        cur.set(to);
        draw(t);
      }
    };

    const retarget = (spec: FieldSpec, animate: boolean) => {
      active = spec;
      cancelAnimationFrame(raf);
      raf = 0;
      from.set(cur);
      fill(spec);
      if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        sweepBase = -1;
        total = 0;
        cur.set(to);
        draw(0);
        return;
      }
      let moved = false;
      for (let i = 0; i < n * 6 && !moved; i += 6) moved = from[i] !== to[i] || from[i + 1] !== to[i + 1];
      const late = new Set(spec.late);
      const colBase = spec.sweep ? (moved ? 700 : 150) : 0;
      const lateBase = moved ? 950 : 200;
      for (let sid = 0; sid < n; sid++) {
        delay[sid * 2] = (((sid * 7919) % 97) / 97) * 240;
        delay[sid * 2 + 1] = spec.sweep
          ? colBase + (Math.floor(spec.slot[sid] / cols) / rows) * SWEEP_MS
          : late.has(spec.tone[sid])
            ? lateBase + (((sid * 104729) % 89) / 89) * 350
            : 0;
      }
      sweepBase = spec.sweep ? colBase : -1;
      total = (spec.sweep ? colBase + SWEEP_MS : lateBase + 350) + Math.max(POS_MS, COL_MS) + 60;
      t0 = performance.now();
      raf = requestAnimationFrame(loop);
    };

    measure();
    retarget(latest.current, false);
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      measure();
      retarget(active, false);
    });
    ro.observe(el);

    engine.current = {
      retarget,
      pick: (mx, my) => {
        if (raf) return null;
        const col = Math.floor(mx / hitPitch);
        const row = Math.floor(my / hitPitch);
        const s = row * hitCols + col;
        if (col < 0 || col >= hitCols || s < 0 || s >= hitCount) return null;
        return { sid: inv[s], x: (col + 0.5) * hitPitch, y: row * hitPitch };
      },
    };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      engine.current = null;
    };
  }, [n, height]);

  useEffect(() => {
    if (latest.current === spec) return;
    latest.current = spec;
    setTip(null);
    engine.current?.retarget(spec, true);
  }, [spec]);

  return (
    <div ref={wrap} className="relative w-full" style={{ height }}>
      <canvas
        ref={canvas}
        className="block"
        role="img"
        aria-label={`Lưới ${n} chấm, mỗi chấm là một khách hàng`}
        onMouseLeave={() => setTip(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const hit = engine.current?.pick(e.clientX - r.left, e.clientY - r.top);
          if (!hit) return setTip(null);
          const label = spec.labels[spec.tone[hit.sid]];
          setTip({ x: hit.x, y: hit.y, text: `Khách #${ids[hit.sid]}${label ? ` · ${label}` : ""}` });
        }}
      />
      {tip && (
        <div
          className="tabular pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-ink px-2 py-1 text-[11px] font-medium text-white shadow"
          style={{ left: Math.min(Math.max(tip.x, 90), (wrap.current?.clientWidth ?? 9999) - 90), top: tip.y - 4 }}
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}
