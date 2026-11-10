"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ALGO_COLOR, ALGO_IDS, ALGO_NAME, DataTable, LineChartBox, type Series } from "@/components/charts";
import { Card, CardHeader, Note, PageTitle, Segmented, Spinner, fmt, fmtCompact, fmtMs, pct } from "@/components/ui";
import type { EvalMetrics, Method } from "@/lib/mining/rules";
import type { MineStats } from "@/lib/mining/types";

interface MinsupRow {
  minsupPct: number;
  minSupport: number;
  runs: MineStats[];
  patterns?: number;
  closed?: number;
  maximal?: number;
  rules?: number;
  itemsWithRule?: number;
  eval?: EvalMetrics[];
  evalRepeat?: EvalMetrics[];
  evalNoFallback?: EvalMetrics;
}

interface Benchmark {
  generatedAt: string;
  machine: string;
  budgetMs: number;
  sequences: number;
  items: number;
  byMinsup: MinsupRow[];
  bySize: { sequences: number; minSupport: number; runs: MineStats[] }[];
  byMaxLength: { maxLength: number; runs: MineStats[]; patterns: number | null }[];
}

const ALGO_SERIES: Series[] = ALGO_IDS.map((id) => ({ key: id, name: ALGO_NAME[id], color: ALGO_COLOR[id] }));
const METHOD_NAME: Record<Method, string> = { sequential: "Mẫu tuần tự", association: "Luật kết hợp", popularity: "Bán chạy" };
const METHOD_SERIES: Series[] = [
  { key: "sequential", name: METHOD_NAME.sequential, color: "#6250d6" },
  { key: "association", name: METHOD_NAME.association, color: "#eda100" },
  { key: "popularity", name: METHOD_NAME.popularity, color: "#7a8494", dashed: true },
];

const label = (p: number) => `${String(p).replace(".", ",")}%`;
const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0).replace(".", ",")} s`;
const pct0 = (v: number) => `${Math.round(v)}%`;

function algoRows<T extends { runs: MineStats[] }>(rows: T[], x: (r: T) => string, pick: (s: MineStats) => number | null) {
  return rows.map((r) => {
    const out: Record<string, number | string | null> = { x: x(r) };
    for (const s of r.runs) out[s.algorithm] = pick(s);
    return out;
  });
}

export default function ComparePage() {
  const [b, setB] = useState<Benchmark | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"repeat" | "new">("repeat");

  useEffect(() => {
    fetch("/api/static/benchmark")
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error))))
      .then(setB)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  if (error) return <Note tone="warn" title="Chưa có kết quả thực nghiệm">{error} Chạy <code>npm run benchmark</code> trong thư mục web.</Note>;
  if (!b) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-ink-2">
        <Spinner /> Đang tải kết quả thực nghiệm…
      </div>
    );
  }

  const ms = b.byMinsup;
  const time = algoRows(ms, (r) => label(r.minsupPct), (s) => (s.timedOut ? null : s.timeMs));
  const counted = algoRows(ms, (r) => label(r.minsupPct), (s) => (s.timedOut ? null : s.counted));
  const peak = algoRows(ms, (r) => label(r.minsupPct), (s) => (s.timedOut ? null : s.peakEntries));
  const size = algoRows(b.bySize, (r) => fmt(r.sequences), (s) => (s.timedOut ? null : s.timeMs));
  const maxLen = algoRows(b.byMaxLength, (r) => String(r.maxLength), (s) => (s.timedOut ? null : s.timeMs));

  const withPatterns = ms.filter((r) => r.patterns != null);
  const explosion = withPatterns.map((r) => ({ x: label(r.minsupPct), all: r.patterns!, closed: r.closed!, maximal: r.maximal ?? null, rules: r.rules! }));
  const coverage = withPatterns.map((r) => ({
    x: label(r.minsupPct),
    items: (r.itemsWithRule! / b.items) * 100,
    users: r.evalRepeat![0].ruleCoverage * 100,
  }));
  const evalOf = (r: MinsupRow) => (mode === "repeat" ? r.evalRepeat! : r.eval!);
  const quality = withPatterns.map((r) => {
    const out: Record<string, number | string> = { x: label(r.minsupPct) };
    for (const e of evalOf(r)) out[e.method] = e.hitRate * 100;
    return out;
  });

  const first = ms[0];
  const lowest = ms[ms.length - 1];
  const stat = (row: MinsupRow, id: string) => row.runs.find((s) => s.algorithm === id)!;
  const ref = ms.find((r) => r.minsupPct === 3) ?? withPatterns[withPatterns.length - 1];
  const refEval = evalOf(ref);
  const seq = refEval.find((e) => e.method === "sequential")!;
  const assoc = refEval.find((e) => e.method === "association")!;
  const pop = refEval.find((e) => e.method === "popularity")!;
  const allClosed = withPatterns.every((r) => r.closed === r.patterns);

  return (
    <div className="space-y-4">
      <PageTitle
        title="So sánh thuật toán và các hạn chế"
        lead={
          <>
            Thực nghiệm trên {fmt(b.sequences)} chuỗi mua hàng, {b.items} sản phẩm, mẫu dài tối đa 3 item. Mỗi cấu hình chạy 2 lần và lấy lần nhanh hơn;
            giới hạn {b.budgetMs / 1000} giây mỗi lần chạy. Máy đo: {b.machine}. Số liệu tính sẵn bằng <code>npm run benchmark</code>.
          </>
        }
      />

      <SectionTitle n="1" title="Hiệu năng của ba thuật toán" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Thời gian chạy theo minsup" subtitle="Ngưỡng càng thấp, khoảng cách giữa ba thuật toán càng rõ" />
          <div className="px-4 pb-4 pt-3">
            <LineChartBox data={time} xKey="x" series={ALGO_SERIES} format={secs} xLabel="minsup giảm dần →" labelPrefix="minsup " />
            <DataTable data={time} xKey="x" xHeader="minsup" series={ALGO_SERIES} format={fmtMs} />
            <Takeaway>
              Ở minsup {label(first.minsupPct)} cả ba gần như bằng nhau. Xuống {label(lowest.minsupPct)}, GSP mất{" "}
              {stat(lowest, "gsp").timedOut ? `hơn ${b.budgetMs / 1000} s (bị ngắt)` : fmtMs(stat(lowest, "gsp").timeMs)}, SPADE{" "}
              {stat(lowest, "spade").timedOut ? "bị ngắt" : fmtMs(stat(lowest, "spade").timeMs)}, PrefixSpan{" "}
              {fmtMs(stat(lowest, "prefixspan").timeMs)}. Thứ tự GSP &gt; SPADE &gt; PrefixSpan khớp với kết quả trong các bài báo gốc.
            </Takeaway>
          </div>
        </Card>
        <Card>
          <CardHeader title="Số mẫu phải đếm support" subtitle="Trục tung thang log. GSP: ứng viên · SPADE: phép join · PrefixSpan: mở rộng trong CSDL chiếu" />
          <div className="px-4 pb-4 pt-3">
            <LineChartBox data={counted} xKey="x" series={ALGO_SERIES} format={fmtCompact} xLabel="minsup giảm dần →" labelPrefix="minsup " logScale />
            <DataTable data={counted} xKey="x" xHeader="minsup" series={ALGO_SERIES} format={fmt} />
            <Takeaway>
              <b>Hạn chế của GSP và SPADE:</b> cả hai là phương pháp sinh rồi kiểm tra. Riêng mức 2 GSP luôn phải thử |F₁|² + |F₁|(|F₁|−1)/2 ứng viên.{" "}
              <b>Hạn chế của PrefixSpan:</b> không sinh ứng viên nhưng trên dữ liệu dày nó vẫn phải đếm rất nhiều mở rộng trong các CSDL chiếu (đường
              xanh lá nằm trên cùng). Mỗi lần đếm của PrefixSpan rẻ hơn nhiều so với một lần quét CSDL của GSP, nên tổng thời gian vẫn thấp nhất.
            </Takeaway>
          </div>
        </Card>
        <Card>
          <CardHeader title="Đỉnh cấu trúc dữ liệu phụ trong bộ nhớ" subtitle="Trục tung thang log. Đơn vị: số phần tử (item ứng viên, cặp id-list, con trỏ chiếu)" />
          <div className="px-4 pb-4 pt-3">
            <LineChartBox data={peak} xKey="x" series={ALGO_SERIES} format={fmtCompact} xLabel="minsup giảm dần →" labelPrefix="minsup " logScale />
            <DataTable data={peak} xKey="x" xHeader="minsup" series={ALGO_SERIES} format={fmt} />
            <Takeaway>
              <b>GSP</b> phải giữ cả tập ứng viên của một mức trong bộ nhớ, nên tăng vọt khi minsup thấp. <b>SPADE</b> giữ id-list của cả một lớp tương
              đương và tăng dần đều. <b>PrefixSpan</b> với pseudo-projection gần như không đổi vì chỉ giữ con trỏ dọc theo một nhánh đệ quy.
            </Takeaway>
          </div>
        </Card>
        <Card>
          <CardHeader title="Khả năng mở rộng" subtitle="Thời gian chạy khi tăng số chuỗi (minsup 3%) và khi tăng độ dài mẫu tối đa (minsup 4%)" />
          <div className="grid gap-2 px-4 pb-4 pt-3 sm:grid-cols-2">
            <div>
              <LineChartBox data={size} xKey="x" series={ALGO_SERIES} format={secs} xLabel="số chuỗi" height={220} />
              <DataTable data={size} xKey="x" xHeader="Số chuỗi" series={ALGO_SERIES} format={fmtMs} />
            </div>
            <div>
              <LineChartBox data={maxLen} xKey="x" series={ALGO_SERIES} format={secs} xLabel="số item tối đa" height={220} />
              <DataTable data={maxLen} xKey="x" xHeader="Độ dài tối đa" series={ALGO_SERIES} format={fmtMs} />
            </div>
          </div>
          <div className="px-4 pb-4">
            <Takeaway>
              Cả ba tăng gần tuyến tính theo số chuỗi khi giữ nguyên minsup tương đối. Tăng độ dài mẫu thì PrefixSpan chậm dần vì phải chiếu sâu hơn,
              còn GSP gần như không đổi vì ở minsup 4% hầu như không còn ứng viên dài hơn 3.
            </Takeaway>
          </div>
        </Card>
      </div>

      <SectionTitle n="2" title="Hạn chế chung của khai thác mẫu phổ biến" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Bùng nổ số lượng mẫu" subtitle="Trục tung thang log. Không phụ thuộc thuật toán nào được dùng" />
          <div className="px-4 pb-4 pt-3">
            <LineChartBox
              data={explosion}
              xKey="x"
              series={[
                { key: "all", name: "Mọi mẫu phổ biến", color: "#3d4a5c" },
                { key: "maximal", name: "Mẫu maximal", color: "#6250d6" },
                { key: "rules", name: "Luật tuần tự", color: "#7a8494", dashed: true },
              ]}
              format={fmtCompact}
              xLabel="minsup giảm dần →"
              labelPrefix="minsup "
              logScale
            />
            <DataTable
              data={explosion}
              xKey="x"
              xHeader="minsup"
              series={[
                { key: "all", name: "Mọi mẫu", color: "" },
                { key: "closed", name: "Closed", color: "" },
                { key: "maximal", name: "Maximal", color: "" },
                { key: "rules", name: "Luật", color: "" },
              ]}
              format={fmt}
            />
            <Takeaway>
              Từ {label(first.minsupPct)} xuống {label(withPatterns[withPatterns.length - 1].minsupPct)}, số mẫu tăng từ {fmt(withPatterns[0].patterns!)} lên{" "}
              {fmt(withPatterns[withPatterns.length - 1].patterns!)}. Không ai đọc nổi hàng chục nghìn mẫu, nên cần bước lọc phía sau.{" "}
              {allClosed ? (
                <>
                  Đáng chú ý: trên dữ liệu này <b>mẫu closed không giúp rút gọn</b> (số mẫu closed bằng số mẫu thường), vì với hàng nghìn khách gần như
                  không có hai mẫu lồng nhau nào trùng đúng support. Mẫu maximal rút gọn được nhưng làm mất support của mẫu con.
                </>
              ) : (
                <>Mẫu closed và maximal giúp rút gọn một phần.</>
              )}
            </Takeaway>
          </div>
        </Card>
        <Card>
          <CardHeader title="Thế khó khi chọn minsup" subtitle="minsup cao thì sạch nhưng bỏ sót sản phẩm ít người mua" />
          <div className="px-4 pb-4 pt-3">
            <LineChartBox
              data={coverage}
              xKey="x"
              series={[
                { key: "items", name: "Sản phẩm có ít nhất 1 luật dẫn tới", color: "#6250d6" },
                { key: "users", name: "Khách nhận được gợi ý từ luật", color: "#eda100" },
              ]}
              format={pct0}
              xLabel="minsup giảm dần →"
              labelPrefix="minsup "
            />
            <DataTable
              data={coverage}
              xKey="x"
              xHeader="minsup"
              series={[
                { key: "items", name: "Sản phẩm có luật", color: "" },
                { key: "users", name: "Khách có gợi ý từ luật", color: "" },
              ]}
              format={(v) => `${v.toFixed(1).replace(".", ",")}%`}
            />
            <Takeaway>
              Ở minsup {label(first.minsupPct)} chỉ {fmt(first.itemsWithRule ?? 0)}/{b.items} sản phẩm có luật dẫn tới: phần còn lại của danh mục không
              bao giờ được gợi ý (vấn đề đuôi dài). Hạ minsup thì phủ được nhiều hơn nhưng phải trả bằng thời gian chạy và số mẫu ở các biểu đồ trên.
            </Takeaway>
          </div>
        </Card>
      </div>

      <SectionTitle n="3" title="Chất lượng gợi ý so với baseline" />
      <Card>
        <CardHeader
          title="Đánh giá offline: giấu đơn cuối, dự đoán từ các đơn trước"
          subtitle={`Top 10 gợi ý cho mỗi khách, so với đơn thật bị giấu. minconf 10%. ${fmt(seq.users)} khách được đánh giá.`}
          right={
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "repeat", label: "Tính cả mua lại" },
                { value: "new", label: "Chỉ sản phẩm mới" },
              ]}
            />
          }
        />
        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1fr]">
          <div>
            <h3 className="mb-2 text-[13px] font-semibold">Tại minsup {label(ref.minsupPct)}</h3>
            <table className="tabular w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line-strong text-left text-xs text-ink-2">
                  <th className="py-1.5 font-medium">Phương pháp</th>
                  <th className="px-2 py-1.5 text-right font-medium" title="Tỷ lệ khách có ít nhất 1 gợi ý trúng">HitRate@10</th>
                  <th className="px-2 py-1.5 text-right font-medium">Precision@10</th>
                  <th className="px-2 py-1.5 text-right font-medium">Recall@10</th>
                  <th className="px-2 py-1.5 text-right font-medium" title="Trung bình nghịch đảo thứ hạng của gợi ý trúng đầu tiên">MRR</th>
                  <th className="py-1.5 text-right font-medium" title="Tỷ lệ danh mục từng được gợi ý">Độ phủ</th>
                </tr>
              </thead>
              <tbody>
                {refEval.map((e) => {
                  const best = Math.max(...refEval.map((x) => x.hitRate)) === e.hitRate;
                  return (
                    <tr key={e.method} className="border-b border-line">
                      <td className="py-2 font-medium">
                        <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: METHOD_SERIES.find((s) => s.key === e.method)!.color }} />
                        {METHOD_NAME[e.method]}
                      </td>
                      <td className={`px-2 py-2 text-right ${best ? "font-semibold text-ink" : ""}`}>{pct(e.hitRate)}</td>
                      <td className="px-2 py-2 text-right">{pct(e.precision)}</td>
                      <td className="px-2 py-2 text-right">{pct(e.recall)}</td>
                      <td className="px-2 py-2 text-right">{e.mrr.toFixed(3).replace(".", ",")}</td>
                      <td className="py-2 text-right">{pct(e.catalogCoverage, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-4 space-y-2.5 text-[13px] leading-relaxed text-ink-2">
              {mode === "repeat" ? (
                <>
                  <p>
                    Khi được phép gợi ý cả món khách từng mua, mẫu tuần tự đạt HitRate <b className="text-ink">{pct(seq.hitRate)}</b>, cao hơn luật kết hợp (
                    {pct(assoc.hitRate)}) và bán chạy ({pct(pop.hitRate)}).
                  </p>
                  <p>
                    Lý do: khách của cửa hàng này phần lớn là đại lý nhập hàng định kỳ. Mẫu tuần tự biểu diễn được hành vi{" "}
                    <span className="font-mono text-ink">⟨A⟩ → ⟨A⟩</span> (mua rồi mua lại) và <span className="font-mono text-ink">⟨A⟩ → ⟨B⟩</span> (mua A
                    trước rồi mới tới B). Luật kết hợp chỉ thấy "A và B từng cùng thuộc một khách" nên không phân biệt được trước sau và không có khái niệm
                    mua lại.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Khi chỉ tính sản phẩm khách chưa từng mua, luật kết hợp ({pct(assoc.hitRate)}) nhỉnh hơn mẫu tuần tự ({pct(seq.hitRate)}); cả hai vẫn
                    hơn bán chạy ({pct(pop.hitRate)}).
                  </p>
                  <p>
                    Đây là kết quả trung thực cần nêu khi báo cáo: luật kết hợp gộp cả hai chiều A trước B, B trước A và cả trường hợp mua cùng đơn, nên mỗi
                    luật có nhiều bằng chứng hơn. Mẫu tuần tự đòi hỏi đúng thứ tự nên support của từng luật thấp hơn, nhiều luật rơi dưới minsup. Thứ tự
                    chỉ có giá trị khi hành vi thật sự có thứ tự.
                  </p>
                </>
              )}
            </div>
          </div>
          <div>
            <h3 className="mb-1 text-[13px] font-semibold">HitRate@10 theo minsup</h3>
            <LineChartBox data={quality} xKey="x" series={METHOD_SERIES} format={pct0} xLabel="minsup giảm dần →" labelPrefix="minsup " />
            <DataTable data={quality} xKey="x" xHeader="minsup" series={METHOD_SERIES} format={(v) => `${v.toFixed(1).replace(".", ",")}%`} />
            <Takeaway>
              Ở minsup cao gần như không có luật nào, mô hình tuần tự thoái hoá thành "bán chạy". Chất lượng tăng nhanh khi hạ minsup rồi bão hoà quanh
              2–3%: hạ thêm chỉ tốn thời gian khai thác mà không cải thiện gợi ý. Đó là cơ sở để chọn mặc định 3% cho cửa hàng.
            </Takeaway>
          </div>
        </div>
      </Card>

      <SectionTitle n="4" title="Hạn chế khi đưa vào ứng dụng" />
      <div className="grid gap-4 md:grid-cols-3">
        <Limit title="Khởi đầu lạnh">
          Khách chưa có đơn nào thì không luật nào khớp; sản phẩm mới chưa có giao dịch thì không xuất hiện trong mẫu nào. Hệ thống buộc phải có phương án
          dự phòng. Xem trực tiếp: vào <Link href="/" className="font-medium text-brand-700 hover:underline">Cửa hàng</Link>, chọn "Khách mới".
        </Limit>
        <Limit title="Mô hình tĩnh">
          Mẫu được khai thác theo lô trên dữ liệu quá khứ. Có đơn hàng mới thì support thay đổi và phải khai thác lại từ đầu; ba thuật toán ở đây đều
          không cập nhật tăng dần. Dữ liệu theo mùa (Giáng sinh) vì thế dễ bị lỗi thời.
        </Limit>
        <Limit title="Không xét khoảng cách thời gian">
          Mẫu ⟨A⟩ → ⟨B⟩ không phân biệt B được mua sau A một tuần hay một năm. GSP gốc có ràng buộc max-gap và cửa sổ trượt cho việc này; bản cài đặt
          trong demo chỉ dùng trọng số giảm dần theo số đơn đã trôi qua.
        </Limit>
      </div>
    </div>
  );
}

function SectionTitle({ n, title }: { n: string; title: string }) {
  return (
    <h2 className="flex items-center gap-2.5 pt-2 text-[15px] font-semibold">
      <span className="tabular flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{n}</span>
      {title}
    </h2>
  );
}

function Takeaway({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 border-l-2 border-brand-500 pl-3 text-[13px] leading-relaxed text-ink-2">{children}</p>;
}

function Limit({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{children}</p>
    </Card>
  );
}
