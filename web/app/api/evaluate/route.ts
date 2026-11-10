import { type Method, evaluate } from "@/lib/mining";
import { DEFAULTS, clampParams, dataset, recModel } from "@/lib/server/store";

const METHODS: Method[] = ["sequential", "association", "popularity"];

/** Đánh giá offline: giấu giỏ cuối của từng khách, gợi ý từ các giỏ trước, so với giỏ bị giấu. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { minsupPct, maxLength } = clampParams(body);
  const model = recModel(minsupPct, maxLength);
  const options = {
    k: Math.min(20, Math.max(1, Number(body.k) || 10)),
    minConfidence: Number(body.minConfidence ?? DEFAULTS.minConfidence),
    excludeBought: body.excludeBought === true,
  };
  const metrics = METHODS.map((method) => evaluate(model, dataset().cases, { ...options, method }));
  return Response.json({ minsupPct, maxLength, ...options, rules: model.rules.length, metrics });
}
