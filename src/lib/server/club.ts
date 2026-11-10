import { db, getSetting, logAction, nowIso, setSetting } from "@/lib/db";
import { createPlan, createProduct, getPlan, getSubscription, reviseSubscription, updatePlanPrice, type Plan } from "@/lib/paypal/client";
import { HttpError } from "./http";

export const CLUB = { name: "Gift Box Club", currency: "GBP", startPrice: 18 };
type PlanRecord = { id: string; kind: "base" | "new_price" | "intro"; price: number; introPrice?: number; introMonths?: number; createdAt: string; createdBy: string };

export const clubPlanId = () => getSetting("club_plan_id") ?? process.env.PAYPAL_CLUB_PLAN_ID ?? null;
const planRecords = (): PlanRecord[] => JSON.parse(getSetting("club_plans") ?? "[]");
const addPlanRecord = (r: PlanRecord) => setSetting("club_plans", JSON.stringify([r, ...planRecords()]));

export function describePlan(p: Plan) {
  const trial = p.billing_cycles.find((c) => c.tenure_type === "TRIAL");
  const regular = p.billing_cycles.find((c) => c.tenure_type === "REGULAR");
  return {
    id: p.id, name: p.name, status: p.status, productId: p.product_id,
    regularPrice: regular ? Number(regular.pricing_scheme.fixed_price.value) : null,
    introPrice: trial ? Number(trial.pricing_scheme.fixed_price.value) : null,
    introMonths: trial?.total_cycles ?? null,
    currency: regular?.pricing_scheme.fixed_price.currency_code ?? CLUB.currency,
  };
}

export async function setupClub(userEmail: string) {
  if (clubPlanId()) throw new HttpError(409, "The Gift Box Club is already set up on PayPal.");
  const product = await createProduct({ name: CLUB.name, description: "A monthly box of gifts from the demo shop", type: "PHYSICAL" });
  const plan = await createPlan({ productId: product.id, name: `${CLUB.name} monthly`, monthlyPrice: CLUB.startPrice, currency: CLUB.currency });
  setSetting("club_plan_id", plan.id);
  addPlanRecord({ id: plan.id, kind: "base", price: CLUB.startPrice, createdAt: nowIso(), createdBy: userEmail });
  logAction({ kind: "club_setup", summary: `Created PayPal product ${product.id} and plan ${plan.id} at £${CLUB.startPrice}/month`, result: { productId: product.id, planId: plan.id }, ok: true, userEmail });
  return describePlan(plan);
}

export async function clubState() {
  const id = clubPlanId();
  if (!id) return { plan: null, plans: [], subscribers: [] };
  const plan = describePlan(await getPlan(id));
  const subs = db().prepare("select * from subscribers order by created_at desc limit 12").all() as { id: string; plan_id: string; status: string; email: string | null; created_at: string }[];
  const live = await Promise.all(subs.map(async (s) => {
    try {
      const l = await getSubscription(s.id);
      if (l.status !== s.status || l.plan_id !== s.plan_id) db().prepare("update subscribers set status = ?, plan_id = ?, updated_at = ? where id = ?").run(l.status, l.plan_id, nowIso(), s.id);
      return { id: s.id, status: l.status, planId: l.plan_id, email: l.subscriber?.email_address ?? s.email, createdAt: s.created_at };
    } catch { return { id: s.id, status: s.status, planId: s.plan_id, email: s.email, createdAt: s.created_at }; }
  }));
  return { plan, plans: planRecords(), subscribers: live };
}

export async function createClubPlan(p: { kind: "new_price" | "intro"; price: number; introPrice?: number; introMonths?: number; userEmail: string }) {
  const id = clubPlanId();
  if (!id) throw new HttpError(409, "Set up the Gift Box Club first.");
  if (!(p.price > 0)) throw new HttpError(400, "Enter a monthly price above zero.");
  if (p.kind === "intro" && !(p.introPrice! >= 0 && p.introMonths! >= 1 && p.introMonths! <= 12)) throw new HttpError(400, "Enter an intro price and between 1 and 12 intro months.");
  const current = await getPlan(id);
  const name = p.kind === "intro" ? `${CLUB.name}: £${p.introPrice} for ${p.introMonths} mo, then £${p.price}` : `${CLUB.name} monthly £${p.price}`;
  const plan = await createPlan({
    productId: current.product_id, name, monthlyPrice: p.price, currency: CLUB.currency,
    intro: p.kind === "intro" ? { price: p.introPrice!, months: p.introMonths! } : undefined,
  });
  setSetting("club_plan_id", plan.id); // new subscribers get the new plan; existing ones keep theirs until they consent
  addPlanRecord({ id: plan.id, kind: p.kind, price: p.price, introPrice: p.introPrice, introMonths: p.introMonths, createdAt: nowIso(), createdBy: p.userEmail });
  logAction({ kind: `plan_${p.kind}`, summary: `Created plan ${plan.id} (${name}); new subscribers now join this plan`, result: { planId: plan.id }, ok: true, userEmail: p.userEmail });
  return describePlan(plan);
}

export async function reviseSubscriber(subscriptionId: string, planId: string, userEmail: string) {
  const r = await reviseSubscription(subscriptionId, planId);
  logAction({ kind: "consent_switch", summary: `Asked subscriber ${subscriptionId} to agree to plan ${planId}`, result: { approveUrl: r.approveUrl }, ok: true, userEmail });
  return { approveUrl: r.approveUrl };
}

export async function updateClubPlanPrice(price: number, userEmail: string) {
  const id = clubPlanId();
  if (!id) throw new HttpError(409, "Set up the Gift Box Club first.");
  try {
    await updatePlanPrice(await getPlan(id), price);
    logAction({ kind: "plan_update", summary: `Changed plan ${id} to £${price}/month for everyone`, ok: true, userEmail });
    return { ok: true };
  } catch (e) {
    logAction({ kind: "plan_update", summary: `PayPal refused a plan-wide price change on ${id}`, result: { error: (e as Error).message }, ok: false, userEmail });
    throw e;
  }
}

export function recordSubscriber(id: string, planId: string | null, status: string, email?: string | null) {
  db().prepare(`insert into subscribers(id, plan_id, status, email, created_at, updated_at) values(?, ?, ?, ?, ?, ?)
    on conflict(id) do update set plan_id = coalesce(excluded.plan_id, subscribers.plan_id), status = excluded.status, email = coalesce(excluded.email, subscribers.email), updated_at = excluded.updated_at`)
    .run(id, planId, status, email ?? null, nowIso(), nowIso());
}
