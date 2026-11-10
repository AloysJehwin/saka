import { cookies } from "next/headers";
import { handle } from "@/lib/server/http";
import { assignArm, getExperimentRow, priceFor, recordView, type Arm } from "@/lib/server/experiments";
import { typicalOrderQty } from "@/lib/server/shop";

/** Public storefront offer. Each shopper is assigned a price once (cookie) and counted as one view. */
export async function GET(_req: Request, ctx: RouteContext<"/api/store/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const e = getExperimentRow(id);
    const jar = await cookies();
    const key = `saka_arm_${id}`;
    let arm = jar.get(key)?.value as Arm | undefined;
    if (arm !== "control" && arm !== "test") {
      arm = assignArm(e);
      jar.set(key, arm, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
      if (e.status === "running") recordView(id, arm);
    }
    return { id, code: e.code, product: e.product, price: priceFor(e, arm), currency: "GBP", defaultQty: typicalOrderQty(e.code), running: e.status === "running" };
  });
}
