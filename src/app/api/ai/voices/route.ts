import { body, handle, HttpError, requireUser } from "@/lib/server/http";
import { forecastFor, product, type ForecastRequest } from "@/lib/server/shop";
import { segmentVoices } from "@/lib/ai/claude";

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const r = await body<ForecastRequest>(req);
    const p = product(r.code);
    if (!p) throw new HttpError(404, "Unknown product.");
    const f = forecastFor(r);
    return segmentVoices({
      product: p.item.description, currency: "£", currentPrice: f.currentPrice, newPrice: f.newPrice,
      segments: f.groups.map((g) => ({ segment: g.id, name: g.name, description: g.description, share: g.share,
        retainedP50: g.retained.p50, retainedP10: g.retained.p10, retainedP90: g.retained.p90 })),
    });
  });
}
