import { db, nowIso } from "@/lib/db";
import { verifyWebhook } from "@/lib/paypal/client";
import { recordPurchase, type Arm } from "@/lib/server/experiments";
import { recordSubscriber } from "@/lib/server/club";

type WebhookEvent = { id: string; event_type: string; summary?: string; resource: Record<string, unknown> & { id?: string } };

/** PayPal webhooks: verified with PayPal before anything is acted on. Unverified events are stored, never applied. */
export async function POST(req: Request) {
  const raw = await req.text();
  let event: WebhookEvent;
  try { event = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  let verified = false;
  try { verified = await verifyWebhook(req.headers, raw); } catch { verified = false; }
  db().prepare("insert or ignore into webhook_events(id, event_type, resource_id, verified, received_at, summary) values(?, ?, ?, ?, ?, ?)")
    .run(event.id, event.event_type, event.resource?.id ?? null, verified ? 1 : 0, nowIso(), event.summary ?? null);
  if (!verified) return new Response("unverified", { status: 400 });

  const r = event.resource;
  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const [tag, expId, arm] = String(r.custom_id ?? "").split(":");
    const orderId = (r.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids?.order_id;
    const amount = Number((r.amount as { value?: string } | undefined)?.value ?? 0);
    if (tag === "exp" && expId && orderId) {
      try { recordPurchase(expId, arm as Arm, orderId, amount, "webhook"); } catch { /* experiment gone */ }
    }
  }
  if (event.event_type.startsWith("BILLING.SUBSCRIPTION.") && typeof r.id === "string") {
    const sub = r as { id: string; plan_id?: string; status?: string; subscriber?: { email_address?: string } };
    recordSubscriber(sub.id, sub.plan_id ?? null, sub.status ?? event.event_type.split(".").pop()!, sub.subscriber?.email_address);
  }
  return new Response("ok");
}
