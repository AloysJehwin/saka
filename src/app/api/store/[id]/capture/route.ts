import { cookies } from "next/headers";
import { body, handle, HttpError } from "@/lib/server/http";
import { getExperimentRow, recordPurchase, type Arm } from "@/lib/server/experiments";
import { captureOrder } from "@/lib/paypal/client";

export async function POST(req: Request, ctx: RouteContext<"/api/store/[id]/capture">) {
  return handle(async () => {
    const { id } = await ctx.params;
    getExperimentRow(id);
    const { orderId } = await body<{ orderId: string }>(req);
    if (!/^[A-Z0-9]{10,30}$/.test(orderId ?? "")) throw new HttpError(400, "Invalid PayPal order.");
    const order = await captureOrder(orderId);
    const unit = order.purchase_units?.[0];
    const cap = unit?.payments?.captures?.[0];
    const [, expId, armFromOrder] = (unit?.custom_id ?? "").split(":");
    const arm = (armFromOrder ?? (await cookies()).get(`saka_arm_${id}`)?.value) as Arm;
    if (order.status === "COMPLETED" && cap && expId === id) recordPurchase(id, arm, order.id, Number(cap.amount.value), "paypal");
    return { status: order.status, orderId: order.id, amount: cap?.amount ?? null };
  });
}
