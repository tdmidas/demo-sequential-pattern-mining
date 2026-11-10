import { readFile } from "node:fs/promises";
import path from "node:path";

const FILES: Record<string, string> = { pipeline: "pipeline.json", benchmark: "benchmark.json" };

/** Trả về các file JSON tính sẵn: số liệu pipeline tiền xử lý và kết quả benchmark. */
export async function GET(_request: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const file = FILES[name];
  if (!file) return Response.json({ error: "not found" }, { status: 404 });
  try {
    const text = await readFile(path.join(process.cwd(), "data", file), "utf8");
    return new Response(text, { headers: { "content-type": "application/json; charset=utf-8" } });
  } catch {
    return Response.json({ error: `Chưa có ${file}. Hãy chạy pipeline / benchmark trước.` }, { status: 404 });
  }
}
