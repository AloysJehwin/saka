import { body, handle, HttpError, requireUser } from "@/lib/server/http";
import { elasticityView, forecastFor, product, type ForecastRequest } from "@/lib/server/shop";
import { advise } from "@/lib/ai/claude";

const gbp = (n: number) => `£${n.toFixed(0)}`;

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const r = await body<ForecastRequest>(req);
    const p = product(r.code);
    if (!p) throw new HttpError(404, "Unknown product.");
    const f = forecastFor(r);
    const e = elasticityView(r.code);
    return advise({
      product: p.item.description, currency: "£", currentPrice: f.currentPrice, candidatePrice: f.newPrice, usePayPalData: true,
      forecastSummary: `Monthly units ${f.units.base.toFixed(0)} now; at the new price median ${f.units.p50.toFixed(0)} (80% range ${f.units.p10.toFixed(0)}-${f.units.p90.toFixed(0)}). ` +
        `Monthly profit after PayPal fees ${gbp(f.profit.base)} now; median ${gbp(f.profit.p50)} (80% range ${gbp(f.profit.p10)}-${gbp(f.profit.p90)}). ` +
        `Chance profit rises: ${(f.probProfitUp * 100).toFixed(0)}%. Evidence on price sensitivity from history: ${e.evidence}. ` +
        `The shop also runs a monthly Gift Box Club subscription on PayPal. Customer groups: ` +
        f.groups.map((g) => `${g.name} ${(g.share * 100).toFixed(0)}% of units, keep ${(g.retained.p50 * 100).toFixed(0)}%`).join("; ") + ".",
    });
  });
}
