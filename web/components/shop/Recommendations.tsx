"use client";

import { Check, Info, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { Item } from "@/lib/data";
import type { Method, Recommendation } from "@/lib/mining/rules";
import type { AlgorithmId } from "@/lib/mining/types";
import { ALGO_COLOR, ALGO_IDS, ALGO_NAME } from "../charts";
import { useShop } from "../shop-context";
import { Card, Note, PatternView, ProductArt, Segmented, Spinner, fmt, fmtCompact, fmtMs, money, pct, shortName, titleCase } from "../ui";

interface RecResponse {
  recommendations: Recommendation[];
  method: Method;
  model: {
    minsupPct: number;
    maxLength: number;
    minSupport: number;
    rules: number;
    sequences: number;
    algorithm: AlgorithmId;
    mineMs: number;
    timedOut: boolean;
    patterns: number;
    counted: number;
    dbScans: number;
  };
  tookMs: number;
}

const METHOD_INFO: Record<Method, { label: string; blurb: string }> = {
  sequential: {
    label: "Mẫu tuần tự",
    blurb: "Luật ⟨đã mua A, rồi B⟩ ⇒ C rút từ mẫu tuần tự phổ biến. Có xét thứ tự các đơn hàng.",
  },
  association: {
    label: "Luật kết hợp",
    blurb: "Luật A ⇒ B trên tập sản phẩm mỗi khách từng mua. Không xét thứ tự.",
  },
  popularity: {
    label: "Bán chạy",
    blurb: "Sản phẩm có nhiều khách mua nhất. Không cá nhân hoá, ai cũng thấy như nhau.",
  },
};

export function Recommendations({ revealHeldOut, onOpen }: { revealHeldOut: boolean; onOpen: (item: Item) => void }) {
  const { catalog, history, persona, newOrders, settings, updateSettings, addToCart, cart, analysis } = useShop();
  const [data, setData] = useState<RecResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  // Ngoài góc nhìn kỹ thuật, cửa hàng luôn dùng mô hình mẫu tuần tự với tham số mặc định.
  const method: Method = analysis ? settings.method : "sequential";
  const historyKey = JSON.stringify(history.map((b) => b.items));
  useEffect(() => {
    if (!catalog) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch("/api/recommend", {
      method: "POST",
      signal: ctrl.signal,
      body: JSON.stringify({ history: JSON.parse(historyKey), ...settings, method, k: 10 }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: RecResponse) => {
        setData(d);
        setSelected(null);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        setError(String(e.message ?? e));
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [catalog, historyKey, settings, method]);

  if (!catalog) return null;
  const items = catalog.items;
  const recs = data?.recommendations ?? [];
  const heldOut = analysis && revealHeldOut && persona && newOrders === 0 ? new Set(persona.heldOut.items) : null;
  const hits = heldOut ? recs.filter((r) => heldOut.has(r.item)).length : 0;
  const fallbackCount = recs.filter((r) => r.fallback).length;
  const bought = new Set(history.flatMap((b) => b.items));
  const sel = analysis ? (recs.find((r) => r.item === selected) ?? null) : null;
  const personalised = history.length > 0 && recs.some((r) => r.why.type !== "popularity");

  return (
    <Card>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <h2 className="text-base font-semibold">{personalised || analysis ? "Gợi ý dành cho bạn" : "Đang bán chạy"}</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {analysis
              ? METHOD_INFO[method].blurb
              : personalised
                ? "Chọn riêng theo những đơn hàng bạn đã đặt"
                : "Những sản phẩm được nhiều khách chọn mua nhất"}
          </p>
        </div>
        {analysis && (
          <Segmented
            value={settings.method}
            onChange={(m) => updateSettings({ method: m })}
            options={(Object.keys(METHOD_INFO) as Method[]).map((m) => ({ value: m, label: METHOD_INFO[m].label }))}
          />
        )}
      </header>

      {analysis && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-page/60 px-5 py-2.5 text-[13px]">
          <div className="flex items-center gap-2">
            <span className="text-ink-2">Thuật toán khai thác</span>
            <Segmented
              size="sm"
              value={settings.algorithm}
              onChange={(algorithm) => updateSettings({ algorithm })}
              options={ALGO_IDS.map((id) => ({ value: id, label: ALGO_NAME[id] }))}
            />
          </div>
          <label className="flex items-center gap-2">
            <span className="text-ink-2">minsup</span>
            <select
              value={settings.minsupPct}
              onChange={(e) => updateSettings({ minsupPct: Number(e.target.value) })}
              className="rounded border border-line-strong bg-surface px-2 py-1"
            >
              {[1.5, 2, 3, 4, 5, 8].map((v) => (
                <option key={v} value={v}>
                  {String(v).replace(".", ",")}% ({fmt(Math.ceil((v / 100) * catalog.sequences))} khách)
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-ink-2">minconf</span>
            <select
              value={settings.minConfidence}
              onChange={(e) => updateSettings({ minConfidence: Number(e.target.value) })}
              className="rounded border border-line-strong bg-surface px-2 py-1"
            >
              {[0.05, 0.1, 0.2, 0.3].map((v) => (
                <option key={v} value={v}>
                  {v * 100}%
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.excludeBought}
              onChange={(e) => updateSettings({ excludeBought: e.target.checked })}
              className="h-4 w-4 accent-brand-600"
            />
            <span>Chỉ gợi ý sản phẩm chưa từng mua</span>
          </label>
          <div className="tabular flex w-full items-center gap-2 border-t border-line pt-2 text-xs text-ink-2">
            {loading ? (
              <>
                <Spinner className="!h-3.5 !w-3.5 text-brand-600" /> {ALGO_NAME[settings.algorithm]} đang khai thác mẫu ở minsup {settings.minsupPct}%…
              </>
            ) : data ? (
              <>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ALGO_COLOR[data.model.algorithm] }} />
                <span>
                  Khai thác bằng <b className="text-ink">{ALGO_NAME[data.model.algorithm]}</b> trong{" "}
                  <b className="text-ink">{fmtMs(data.model.mineMs)}</b> · đếm support{" "}
                  {fmtCompact(data.model.counted)} mẫu · quét CSDL {data.model.dbScans} lần · ra {fmt(data.model.patterns)} mẫu phổ biến, {fmt(data.model.rules)} luật ·
                  minsup = {fmt(data.model.minSupport)}/{fmt(data.model.sequences)} chuỗi
                </span>
              </>
            ) : null}
          </div>
        </div>
      )}

      <div className="px-5 py-4">
        {error && <Note tone="warn">Không tải được gợi ý: {error}</Note>}
        {!data && loading && (
          <div className="flex h-56 items-center justify-center gap-2 text-sm text-ink-2">
            <Spinner /> Đang chuẩn bị gợi ý cho bạn…
          </div>
        )}
        {data && (
          <>
            {analysis && !data.model.timedOut && method === "sequential" && (
              <p className="mb-3 text-[13px] text-ink-2">
                Đổi thuật toán khai thác không làm đổi danh sách gợi ý, vì cả ba cho cùng một tập mẫu. Chỉ thời gian và chi phí ở dòng trên thay đổi.
              </p>
            )}
            {analysis && history.length === 0 && method !== "popularity" && (
              <div className="mb-3">
                <Note tone="warn" title="Khởi đầu lạnh (cold start)">
                  Khách mới chưa có đơn hàng nào nên không luật nào khớp được. Hệ thống buộc phải quay về danh sách bán chạy. Thêm sản phẩm vào giỏ và
                  đặt hàng để thấy luật bắt đầu hoạt động.
                </Note>
              </div>
            )}
            {analysis && history.length > 0 && fallbackCount > 0 && (
              <p className="mb-3 text-[13px] text-ink-2">
                Chỉ có <b className="text-ink">{recs.length - fallbackCount}</b> gợi ý đến từ luật; {fallbackCount} vị trí còn lại được bổ sung bằng sản phẩm
                bán chạy.
              </p>
            )}
            {heldOut && (
              <div className="mb-3">
                <Note tone={hits ? "good" : "info"}>
                  Đối chiếu với đơn thật kế tiếp của khách: <b>{hits}</b>/{recs.length} gợi ý có trong đơn ({persona!.heldOut.items.length} sản phẩm). Đơn
                  này không tham gia khai thác.
                </Note>
              </div>
            )}
            <div className={`grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-5 ${loading ? "opacity-50" : ""}`}>
              {recs.map((r, i) => {
                const it = items[r.item];
                const isHit = heldOut?.has(r.item);
                const inCart = cart.includes(r.item);
                const again = bought.has(r.item);
                return (
                  <article
                    key={r.item}
                    className={`group relative flex flex-col overflow-hidden rounded-md border bg-surface transition-shadow hover:shadow-md ${
                      selected === r.item && analysis ? "border-brand-500 ring-1 ring-brand-500" : "border-line"
                    }`}
                  >
                    <button onClick={() => onOpen(it)} className="block text-left" aria-label={`Xem ${it.name}`}>
                      <ProductArt item={it} />
                    </button>
                    {analysis && (
                      <span className="tabular absolute left-0 top-0 rounded-br-md bg-ink/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        #{i + 1}
                      </span>
                    )}
                    {isHit ? (
                      <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded bg-good px-1.5 py-0.5 text-[10.5px] font-semibold text-white">
                        <Check className="h-3 w-3" /> Có trong đơn thật
                      </span>
                    ) : again ? (
                      <span className="absolute right-1.5 top-1.5 rounded bg-surface/95 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-700 ring-1 ring-brand-200">
                        Mua lại
                      </span>
                    ) : null}
                    <div className="flex flex-1 flex-col p-2.5">
                      <h3 className="line-clamp-2 min-h-[36px] text-[12.5px] font-medium leading-snug">{titleCase(it.name)}</h3>
                      <div className="tabular mt-1 text-[15px] font-semibold text-accent">{money(it.price)}</div>
                      <p className="mt-1.5 line-clamp-2 min-h-[32px] text-[11.5px] leading-snug text-ink-2">
                        {analysis ? <TechReason rec={r} items={items} /> : <FriendlyReason rec={r} items={items} again={again} />}
                      </p>
                      <div className="mt-2 flex gap-1.5">
                        {analysis ? (
                          <>
                            <button
                              onClick={() => setSelected(selected === r.item ? null : r.item)}
                              aria-pressed={selected === r.item}
                              className="flex h-8 flex-1 items-center justify-center gap-1 rounded border border-line-strong text-[11.5px] font-medium text-ink-2 hover:border-brand-500 hover:text-brand-700"
                            >
                              <Info className="h-3.5 w-3.5" /> Vì sao?
                            </button>
                            <button
                              onClick={() => addToCart(r.item)}
                              disabled={inCart}
                              aria-label={inCart ? "Đã có trong giỏ" : `Thêm ${it.name} vào giỏ`}
                              className="flex h-8 w-9 items-center justify-center rounded bg-brand-600 text-white hover:bg-brand-700 disabled:bg-line-strong"
                            >
                              {inCart ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-4 w-4" />}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => addToCart(r.item)}
                            disabled={inCart}
                            className="flex h-8 flex-1 items-center justify-center gap-1 rounded border border-brand-600 text-[12.5px] font-medium text-brand-700 hover:bg-brand-50 disabled:border-line-strong disabled:text-ink-3 disabled:hover:bg-transparent"
                          >
                            {inCart ? (
                              <>
                                <Check className="h-3.5 w-3.5" /> Đã thêm
                              </>
                            ) : (
                              <>
                                <Plus className="h-3.5 w-3.5" /> Thêm vào giỏ
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {sel && <Explain rec={sel} items={items} sequences={data.model.sequences} />}
          </>
        )}
      </div>
    </Card>
  );
}

/** Lý do hiển thị cho người mua: ngôn ngữ của một sàn thương mại, không có thuật ngữ. */
function FriendlyReason({ rec, items, again }: { rec: Recommendation; items: Item[]; again: boolean }) {
  const w = rec.why;
  if (w.type === "sequential") {
    const flat = [...new Set(w.antecedent.flat())];
    if (again && flat.length === 1 && flat[0] === rec.item) return <>Bạn từng mua, nhiều khách mua lại</>;
    const firstOther = flat.find((x) => x !== rec.item) ?? flat[0];
    return (
      <>
        Vì bạn đã mua <span className="text-ink">{shortName(items[firstOther], 24)}</span>
      </>
    );
  }
  if (w.type === "association") {
    return (
      <>
        Thường được mua cùng <span className="text-ink">{shortName(items[w.given], 24)}</span>
      </>
    );
  }
  return <>{fmt(w.buyers)} khách đã mua</>;
}

function TechReason({ rec, items }: { rec: Recommendation; items: Item[] }) {
  const w = rec.why;
  if (w.type === "sequential") {
    const flat = w.antecedent.flat();
    return (
      <>
        conf <b className="text-ink">{pct(w.confidence, 0)}</b> · sau {flat.length === 1 ? `“${shortName(items[flat[0]], 16)}”` : `${flat.length} món`}
      </>
    );
  }
  if (w.type === "association") {
    return (
      <>
        conf <b className="text-ink">{pct(w.confidence, 0)}</b> · cùng “{shortName(items[w.given], 16)}”
      </>
    );
  }
  return (
    <>
      {rec.fallback ? "Dự phòng · " : ""}
      <b className="text-ink">{fmt(w.buyers)}</b> khách đã mua
    </>
  );
}

function Explain({ rec, items, sequences }: { rec: Recommendation; items: Item[]; sequences: number }) {
  const w = rec.why;
  return (
    <div className="fade-up mt-4 rounded-md border border-brand-200 bg-brand-50/60 p-4">
      <div className="mb-2 text-[13px] font-semibold text-brand-900">Vì sao gợi ý “{titleCase(items[rec.item].name)}”?</div>
      {w.type === "sequential" && (
        <>
          <div className="mb-3 text-[13px]">
            <span className="mr-2 text-ink-2">Luật tuần tự khớp với lịch sử:</span>
            <PatternView pattern={w.antecedent} items={items} then={rec.item} max={34} />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
            <Metric label="Support" value={`${fmt(w.support)} khách`} hint={`${pct(w.support / sequences)} số chuỗi`} />
            <Metric label="Confidence" value={pct(w.confidence)} hint="sup(luật) / sup(vế trái)" />
            <Metric label="Lift" value={w.lift.toFixed(2).replace(".", ",")} hint={w.lift > 1 ? "cao hơn mức ngẫu nhiên" : "không hơn ngẫu nhiên"} />
            <Metric
              label="Độ gần"
              value={w.gap === 0 ? "Đơn gần nhất" : `Cách ${w.gap} đơn`}
              hint={`điểm = conf × 0,85^${w.gap} = ${rec.score.toFixed(3).replace(".", ",")}`}
            />
          </dl>
        </>
      )}
      {w.type === "association" && (
        <>
          <div className="mb-3 text-[13px]">
            <span className="mr-2 text-ink-2">Luật kết hợp (không có thứ tự):</span>
            <PatternView pattern={[[w.given]]} items={items} then={rec.item} max={34} />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
            <Metric label="Support" value={`${fmt(w.support)} khách`} hint="từng mua cả hai, bất kể trước sau" />
            <Metric label="Confidence" value={pct(w.confidence)} />
            <Metric label="Lift" value={w.lift.toFixed(2).replace(".", ",")} />
          </dl>
        </>
      )}
      {w.type === "popularity" && (
        <p className="text-[13px] text-ink-2">
          Không có luật nào dẫn tới sản phẩm này. Nó được chọn vì {fmt(w.buyers)} khách ({pct(w.share)}) từng mua, tức là không liên quan gì tới lịch sử
          riêng của khách đang xem.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="tabular font-semibold text-ink">{value}</dd>
      {hint && <dd className="text-[11.5px] text-ink-3">{hint}</dd>}
    </div>
  );
}
