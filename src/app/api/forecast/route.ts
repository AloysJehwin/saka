import { body, handle, HttpError, requireUser } from "@/lib/server/http";
import { forecastFor, product, type ForecastRequest } from "@/lib/server/shop";

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const r = await body<ForecastRequest>(req);
    if (!product(r.code)) throw new HttpError(404, "Unknown product.");
    if (!(r.newPrice > 0)) throw new HttpError(400, "Enter a price above zero.");
    return forecastFor(r);
  });
}
