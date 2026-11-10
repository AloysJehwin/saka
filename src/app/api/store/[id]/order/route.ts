import { cookies } from "next/headers";
import { body, handle, HttpError } from "@/lib/server/http";
import { getExperimentRow, priceFor, type Arm } from "@/lib/server/experiments";
import { createOrder } from "@/lib/paypal/client";

/** Creates the PayPal order server-side at the shopper's assigned price; the browser never sets the price. */
export async function POST(req: Request, ctx: RouteContext<"/api/store/[id]/order">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const e = getExperimentRow(id);
    const arm = (await cookies()).get(`saka_arm_${id}`)?.value as Arm | undefined;
    if (arm !== "control" && arm !== "test") throw new HttpError(400, "Reload the page and try again.");
    const { qty } = await body<{ qty: number }>(req);
    const q = Math.round(qty);
    if (!(q >= 1 && q <= 500)) throw new HttpError(400, "Choose a quantity between 1 and 500.");
    const unit = priceFor(e, arm);
    const order = await createOrder({
      amount: Math.round(unit * q * 100) / 100, currency: "GBP",
      description: `${q} x ${e.product} @ £${unit.toFixed(2)}`, customId: `exp:${id}:${arm}`,
    });
    return { id: order.id };
  });
}
