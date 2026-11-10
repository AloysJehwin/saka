import { body, handle, HttpError } from "@/lib/server/http";
import { recordSubscriber } from "@/lib/server/club";
import { getSubscription } from "@/lib/paypal/client";

/** Called after a buyer approves a subscription; we confirm it with PayPal before recording it. */
export async function POST(req: Request) {
  return handle(async () => {
    const { subscriptionId } = await body<{ subscriptionId: string }>(req);
    if (!/^I-[A-Z0-9]{8,20}$/.test(subscriptionId ?? "")) throw new HttpError(400, "Invalid subscription.");
    const s = await getSubscription(subscriptionId);
    recordSubscriber(s.id, s.plan_id, s.status, s.subscriber?.email_address);
    return { status: s.status, planId: s.plan_id };
  });
}
