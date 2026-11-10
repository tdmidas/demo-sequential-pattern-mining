"use client";

import { useEffect, useState } from "react";
import { BarChartBox } from "@/components/charts";
import { useShop } from "@/components/shop-context";
import { Card, CardHeader, Note, PageTitle, Spinner, Stat, fmt, fmtDate, shortName } from "@/components/ui";

interface StepRow {
  key: string;
  label: string;
  note: string;
  rows: number;
  invoices: number;
  customers: number;
  items: number;
}

interface Pipeline {
  source: string;
  params: { topItems: number; minBaskets: number; maxBaskets: number };
  steps: StepRow[];
  stats: {
    sequences: number;
    items: number;
    trainBaskets: number;
    avgSeqLen: number;
    medianSeqLen: number;
    maxSeqLen: number;
    avgBasketSize: number;
    medianBasketSize: number;
    maxBasketSize: number;
    density: number;
    dateMin: string;
    dateMax: string;
    countries: number;
  };
  seqLenHist: { label: string; count: number }[];
  basketSizeHist: { label: string; count: number }[];
  sample: { customer: number; baskets: { date: string; items: number[] }[]; spmf: string };
}

const vn = (n: number) => String(n).replace(".", ",");

export default function DataPage() {
  const { catalog } = useShop();
  const [p, setP] = useState<Pipeline | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/static/pipeline")
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error))))
      .then(setP)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  if (error) return <Note tone="warn" title="Chưa có dữ liệu">{error}</Note>;
  if (!p) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-ink-2">
        <Spinner /> Đang tải…
      </div>
    );
  }
  const max = p.steps[0].rows;
  const s = p.stats;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Dữ liệu và pipeline tiền xử lý"
        lead={
          <>
            Nguồn: Online Retail II (UCI Machine Learning Repository), giao dịch thật của một cửa hàng quà tặng trực tuyến tại Anh từ {fmtDate(s.dateMin)} đến{" "}
            {fmtDate(s.dateMax)}. Toàn bộ các bước dưới đây nằm trong <code>pipeline/preprocess.py</code> và chạy lại được bằng một lệnh.
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Chuỗi (khách hàng)" value={fmt(s.sequences)} hint={`${s.countries} quốc gia`} />
        <Stat label="Sản phẩm" value={fmt(s.items)} hint={`top ${p.params.topItems} theo số khách mua`} />
        <Stat label="Đơn hàng dùng để khai thác" value={fmt(s.trainBaskets)} hint="không gồm đơn cuối của mỗi khách" />
        <Stat label="Số đơn mỗi chuỗi" value={vn(s.avgSeqLen)} hint={`trung vị ${vn(s.medianSeqLen)} · dài nhất ${s.maxSeqLen}`} />
        <Stat label="Số món mỗi đơn" value={vn(s.avgBasketSize)} hint={`trung vị ${vn(s.medianBasketSize)} · lớn nhất ${s.maxBasketSize}`} />
      </div>

      <Card>
        <CardHeader title="Từ file giao dịch thô đến CSDL chuỗi" subtitle="Độ dài thanh: số dòng giao dịch còn lại sau mỗi bước" />
        <ol className="divide-y divide-line">
          {p.steps.map((st, i) => {
            const prev = i > 0 ? p.steps[i - 1].rows : st.rows;
            const dropped = prev - st.rows;
            return (
              <li key={st.key} className="grid gap-x-5 gap-y-1.5 px-5 py-3.5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                <div className="flex gap-3">
                  <span className="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {i + 1}
                  </span>
                  <div>
                    <div className="text-[13.5px] font-semibold">{st.label}</div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{st.note}</p>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <div className="h-3 flex-1 rounded-sm bg-page">
                      <div className="h-3 rounded-sm bg-brand-500" style={{ width: `${(st.rows / max) * 100}%` }} />
                    </div>
                    <span className="tabular w-24 shrink-0 text-right text-[13px] font-semibold">{fmt(st.rows)} dòng</span>
                  </div>
                  <div className="tabular mt-1 flex flex-wrap gap-x-4 text-xs text-ink-3">
                    {dropped > 0 && <span className="text-bad">−{fmt(dropped)} dòng</span>}
                    <span>{fmt(st.invoices)} hoá đơn</span>
                    <span>{fmt(st.customers)} khách</span>
                    <span>{fmt(st.items)} sản phẩm</span>
                  </div>
                </div>
              </li>
            );
          })}
          <li className="flex gap-3 px-5 py-3.5">
            <span className="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
              {p.steps.length + 1}
            </span>
            <div>
              <div className="text-[13.5px] font-semibold">Tách train / test theo thời gian</div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
                Đơn cuối cùng của mỗi khách được giữ lại làm đáp án. Thuật toán chỉ thấy các đơn trước đó, nên việc đánh giá không bị rò rỉ thông tin
                tương lai.
              </p>
            </div>
          </li>
        </ol>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Phân bố độ dài chuỗi" subtitle="Số khách theo số đơn hàng dùng để khai thác" />
          <div className="px-4 pb-4 pt-3">
            <BarChartBox data={p.seqLenHist} xKey="label" series={[{ key: "count", name: "Số khách", color: "#2a6be0" }]} format={fmt} xLabel="số đơn trong chuỗi" labelPrefix="Số đơn: " height={230} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Phân bố kích thước đơn hàng" subtitle="Số đơn theo số sản phẩm khác nhau trong đơn" />
          <div className="px-4 pb-4 pt-3">
            <BarChartBox data={p.basketSizeHist} xKey="label" series={[{ key: "count", name: "Số đơn", color: "#2a6be0" }]} format={fmt} xLabel="số món trong đơn" labelPrefix="Số món: " height={230} />
          </div>
        </Card>
      </div>

      <Note title="Đặc điểm dữ liệu ảnh hưởng tới thuật toán">
        Mỗi đơn chứa trung bình {vn(s.avgBasketSize)}/{s.items} sản phẩm ({vn(Math.round(s.density * 1000) / 10)}% danh mục) và khách thường mua lặp lại, nên đây
        là dữ liệu khá dày so với dữ liệu click chuột. Hệ quả: cả {s.items} sản phẩm đều đạt minsup ở mọi ngưỡng trong demo, GSP luôn phải thử đủ
        134.850 ứng viên ở mức 2, và các CSDL chiếu của PrefixSpan co lại chậm. Phân bố độ dài chuỗi lệch phải mạnh: nhiều khách chỉ có 1–2 đơn, số ít
        có tới {s.maxSeqLen} đơn.
      </Note>

      <Card>
        <CardHeader title={`Ví dụ một chuỗi: khách #${p.sample.customer}`} subtitle="Cùng một dữ liệu ở dạng dễ đọc và dạng SPMF dùng làm đầu vào cho thuật toán" />
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <ol className="space-y-2.5">
            {p.sample.baskets.map((b, i) => (
              <li key={i}>
                <div className="tabular text-xs text-ink-2">
                  Đơn {i + 1} · {fmtDate(b.date)}
                </div>
                <ul className="mt-1 flex flex-wrap gap-1">
                  {b.items.map((id) => (
                    <li key={id} className="rounded border border-line bg-page px-1.5 py-0.5 text-[11.5px]">
                      <span className="tabular mr-1 font-mono text-ink-3">{id}</span>
                      {shortName(catalog?.items[id], 24)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <div>
            <pre className="thin-scroll overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-ink p-3.5 font-mono text-[12.5px] leading-relaxed text-white/90">{p.sample.spmf}</pre>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
              Định dạng SPMF: các số là id sản phẩm, <code className="font-mono">-1</code> kết thúc một đơn hàng (itemset), <code className="font-mono">-2</code>{" "}
              kết thúc chuỗi. File <code className="font-mono">web/data/sequences.spmf.txt</code> có thể đưa thẳng vào thư viện SPMF để đối chiếu kết quả.
            </p>
            <pre className="thin-scroll mt-3 overflow-x-auto rounded-md border border-line bg-page p-3 font-mono text-xs leading-relaxed text-ink">
{`# chạy lại pipeline (từ thư mục gốc của dự án)
.venv/Scripts/python.exe pipeline/preprocess.py \\
    --top-items ${p.params.topItems} --min-baskets ${p.params.minBaskets} --max-baskets ${p.params.maxBaskets}`}
            </pre>
          </div>
        </div>
      </Card>
    </div>
  );
}
