"use client";

import {
  Archive,
  CakeSlice,
  Coffee,
  Gem,
  Home,
  Lamp,
  NotebookPen,
  PartyPopper,
  Sandwich,
  ShoppingBag,
  Sprout,
  Tag,
  ToyBrick,
  TreePine,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { Item } from "@/lib/data";

// ---------------------------------------------------------------------------
// Định dạng
// ---------------------------------------------------------------------------

const nf = new Intl.NumberFormat("vi-VN");
export const fmt = (n: number) => nf.format(Math.round(n));
export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace(".", ",")}%`;
export const money = (n: number) => `£${n.toFixed(2)}`;

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1).replace(".", ",")} s`;
}

export function fmtCompact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",")} tr`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  return fmt(n);
}

/** "WHITE HANGING HEART T-LIGHT HOLDER" -> "White Hanging Heart T-Light Holder" */
export function titleCase(name: string): string {
  return name.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ---------------------------------------------------------------------------
// Nhóm sản phẩm: biểu tượng + màu nền ô ảnh
// ---------------------------------------------------------------------------

export const CATEGORY_STYLE: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  decor: { icon: Home, bg: "#eef1f6", fg: "#51607a" },
  bags: { icon: ShoppingBag, bg: "#fbeee6", fg: "#a8562a" },
  baking: { icon: CakeSlice, bg: "#fbecef", fg: "#a8455c" },
  kitchen: { icon: UtensilsCrossed, bg: "#e9f3f1", fg: "#2f7268" },
  toys: { icon: ToyBrick, bg: "#fdf3d9", fg: "#946a08" },
  stationery: { icon: NotebookPen, bg: "#ebeffb", fg: "#3f57a6" },
  lunch: { icon: Sandwich, bg: "#edf5e4", fg: "#4f7524" },
  lighting: { icon: Lamp, bg: "#fdf0df", fg: "#a2620f" },
  party: { icon: PartyPopper, bg: "#f6ebf7", fg: "#8a4594" },
  tea: { icon: Coffee, bg: "#f3ece6", fg: "#7b573b" },
  christmas: { icon: TreePine, bg: "#e6f3ea", fg: "#2c7046" },
  storage: { icon: Archive, bg: "#ecf0f1", fg: "#4f6468" },
  garden: { icon: Sprout, bg: "#e8f4e4", fg: "#3f7a2c" },
  jewellery: { icon: Gem, bg: "#efecfa", fg: "#5d4aa8" },
  other: { icon: Tag, bg: "#eff1f4", fg: "#5b6675" },
};

export function ProductArt({ item, className = "" }: { item: Item; className?: string }) {
  const style = CATEGORY_STYLE[item.category] ?? CATEGORY_STYLE.other;
  const Icon = style.icon;
  const [broken, setBroken] = useState(false);
  if (item.image && !broken) {
    return (
      <div className={`relative aspect-[4/3] w-full overflow-hidden bg-white ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.image} alt={titleCase(item.name)} loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className={`relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden ${className}`}
      style={{ background: style.bg, color: style.fg }}
    >
      <Icon className="h-[42%] w-[42%]" strokeWidth={1.25} aria-hidden />
      <span className="absolute bottom-1.5 right-2 font-mono text-[10px] opacity-60">{item.code}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thành phần nhỏ
// ---------------------------------------------------------------------------

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-surface ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-snug text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-md border border-line-strong bg-page p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded-[5px] font-medium transition-colors ${size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]"} ${
            o.value === value ? "bg-surface text-brand-700 shadow-sm ring-1 ring-line-strong" : "text-ink-2 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="tabular mt-1 text-[22px] font-semibold leading-tight text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export function Note({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "good";
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tones = {
    info: "border-brand-200 bg-brand-50 text-brand-900",
    warn: "border-[#f1d9a6] bg-warn-soft text-[#6b3b00]",
    good: "border-[#b9e2cf] bg-good-soft text-[#0b5a40]",
  };
  return (
    <div className={`rounded-md border px-3.5 py-2.5 text-[13px] leading-relaxed ${tones[tone]}`}>
      {title && <div className="mb-0.5 font-semibold">{title}</div>}
      {children}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      aria-label="Đang xử lý"
    />
  );
}

export function PageTitle({ title, lead }: { title: string; lead: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="mt-1 max-w-3xl text-[13.5px] text-ink-2">{lead}</p>
    </div>
  );
}

/** Tên ngắn gọn của sản phẩm cho các chỗ chật (bảng mẫu, chip). */
export function shortName(item: Item | undefined, max = 26): string {
  if (!item) return "?";
  const t = titleCase(item.name);
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Hiển thị một mẫu tuần tự: các itemset nối nhau bằng mũi tên. */
export function PatternView({
  pattern,
  items,
  then,
  max = 26,
  labels,
}: {
  pattern: number[][];
  items?: Item[];
  /** Vế phải của luật (nếu có) được tô nổi. */
  then?: number;
  max?: number;
  /** Nhãn thay thế (dùng cho CSDL minh hoạ a, b, c...). */
  labels?: string[];
}) {
  const name = (id: number) => (labels ? labels[id] : shortName(items?.[id], max));
  const full = (id: number) => (labels ? labels[id] : items?.[id] ? titleCase(items[id].name) : "");
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-1 align-middle">
      {pattern.map((el, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <Arrow />}
          <span className="inline-flex items-center gap-0.5 rounded border border-line-strong bg-page px-1.5 py-0.5 text-xs text-ink">
            {el.map((id, j) => (
              <span key={id} title={full(id)} className={labels ? "font-mono" : ""}>
                {j > 0 && <span className="mx-1 text-ink-3">+</span>}
                {name(id)}
              </span>
            ))}
          </span>
        </span>
      ))}
      {then !== undefined && (
        <span className="inline-flex items-center gap-1">
          <Arrow />
          <span
            title={full(then)}
            className={`rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-800 ${labels ? "font-mono" : ""}`}
          >
            {name(then)}
          </span>
        </span>
      )}
    </span>
  );
}

function Arrow() {
  return (
    <svg width="14" height="8" viewBox="0 0 14 8" className="shrink-0 text-ink-3" aria-label="rồi">
      <path d="M0 4h12M9 1l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
