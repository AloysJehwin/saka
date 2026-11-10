/**
 * Minimal typed PayPal REST client for the calls saka needs.
 * Sandbox by default. Every write accepts an idempotency key (PayPal-Request-Id).
 */
import { randomUUID } from "node:crypto";

const BASE = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

export class PayPalError extends Error {
  constructor(public status: number, public name: string, message: string, public debugId?: string, public details?: unknown) {
    super(message);
  }
}

export function paypalConfig() {
  const env = (process.env.PAYPAL_ENV ?? "sandbox") as keyof typeof BASE;
  if (env !== "sandbox") throw new Error("saka only runs against the PayPal sandbox");
  const clientId = process.env.PAYPAL_CLIENT_ID, clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set");
  return { env, baseUrl: BASE[env], clientId, clientSecret };
}

let token: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;
  const { baseUrl, clientId, clientSecret } = paypalConfig();
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError(res.status, "AUTH_FAILED", `PayPal token request failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return token.value;
}

type Options = { method?: "GET" | "POST" | "PATCH"; body?: unknown; idempotencyKey?: string; query?: Record<string, string | number> };

export async function paypal<T>(path: string, opts: Options = {}): Promise<T> {
  const { baseUrl } = paypalConfig();
  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { Authorization: `Bearer ${await getAccessToken()}`, "Content-Type": "application/json", Prefer: "return=representation" };
  if (method !== "GET") headers["PayPal-Request-Id"] = opts.idempotencyKey ?? randomUUID();
  const res = await fetch(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new PayPalError(res.status, json.name ?? "PAYPAL_ERROR", json.message ?? `PayPal ${method} ${path} failed (${res.status})`, json.debug_id, json.details);
  return json as T;
}

type Money = { currency_code: string; value: string };
type Link = { href: string; rel: string; method: string };
const money = (value: number, currency: string): Money => ({ currency_code: currency, value: value.toFixed(2) });

// ---------- Orders (price canary checkouts) ----------
export type Order = { id: string; status: string; links: Link[]; purchase_units?: { custom_id?: string; payments?: { captures?: { id: string; status: string; amount: Money }[] } }[] };

export function createOrder(p: { amount: number; currency: string; description: string; customId: string; idempotencyKey?: string }) {
  return paypal<Order>("/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: p.idempotencyKey,
    body: { intent: "CAPTURE", purchase_units: [{ amount: money(p.amount, p.currency), description: p.description.slice(0, 127), custom_id: p.customId.slice(0, 127) }] },
  });
}
export const captureOrder = (orderId: string) => paypal<Order>(`/v2/checkout/orders/${orderId}/capture`, { method: "POST", body: {} });
export const getOrder = (orderId: string) => paypal<Order>(`/v2/checkout/orders/${orderId}`);

// ---------- Catalog products and billing plans ----------
export type Product = { id: string; name: string };
export const createProduct = (p: { name: string; description?: string; type?: "PHYSICAL" | "DIGITAL" | "SERVICE" }) =>
  paypal<Product>("/v1/catalogs/products", { method: "POST", body: { name: p.name, description: p.description, type: p.type ?? "PHYSICAL" } });

export type Plan = { id: string; product_id: string; name: string; status: string; billing_cycles: { tenure_type: string; sequence: number; pricing_scheme: { fixed_price: Money } }[] };

/** Monthly plan, optionally with a priced intro (trial) period. PayPal allows up to two trial cycles. */
export function createPlan(p: { productId: string; name: string; description?: string; monthlyPrice: number; currency: string; intro?: { price: number; months: number } }) {
  const freq = { interval_unit: "MONTH", interval_count: 1 };
  const cycles = [] as unknown[];
  if (p.intro) cycles.push({ frequency: freq, tenure_type: "TRIAL", sequence: 1, total_cycles: p.intro.months, pricing_scheme: { fixed_price: money(p.intro.price, p.currency) } });
  cycles.push({ frequency: freq, tenure_type: "REGULAR", sequence: cycles.length + 1, total_cycles: 0, pricing_scheme: { fixed_price: money(p.monthlyPrice, p.currency) } });
  return paypal<Plan>("/v1/billing/plans", {
    method: "POST",
    body: {
      product_id: p.productId, name: p.name, description: p.description, status: "ACTIVE", billing_cycles: cycles,
      payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: "CONTINUE", payment_failure_threshold: 3 },
    },
  });
}
export const getPlan = (planId: string) => paypal<Plan>(`/v1/billing/plans/${planId}`);

/** Change the regular price of a plan (for example $5/month to $7/month). */
export async function updatePlanPrice(plan: Plan, newPrice: number) {
  const regular = plan.billing_cycles.find((c) => c.tenure_type === "REGULAR");
  if (!regular) throw new Error(`plan ${plan.id} has no regular billing cycle`);
  await paypal<void>(`/v1/billing/plans/${plan.id}/update-pricing-schemes`, {
    method: "POST",
    body: { pricing_schemes: [{ billing_cycle_sequence: regular.sequence, pricing_scheme: { fixed_price: money(newPrice, regular.pricing_scheme.fixed_price.currency_code) } }] },
  });
}

// ---------- Subscriptions ----------
export type Subscription = { id: string; status: string; plan_id: string; subscriber?: { email_address?: string; name?: { given_name?: string } }; links?: Link[] };
export const getSubscription = (id: string) => paypal<Subscription>(`/v1/billing/subscriptions/${id}`);

/** Move a subscriber to another plan. PayPal requires the buyer's consent and returns an approval link. */
export async function reviseSubscription(id: string, planId: string) {
  const res = await paypal<{ plan_id: string; links: Link[] }>(`/v1/billing/subscriptions/${id}/revise`, { method: "POST", body: { plan_id: planId } });
  return { approveUrl: res.links.find((l) => l.rel === "approve")?.href ?? null, links: res.links };
}

// ---------- Reporting (transaction search) ----------
export type TransactionDetail = {
  transaction_info: { transaction_id: string; transaction_event_code: string; transaction_initiation_date: string; transaction_amount: Money; fee_amount?: Money; transaction_status: string };
  payer_info?: { account_id?: string; country_code?: string };
};

/** List transactions between two dates, splitting into the 31-day windows the API requires. */
export async function listTransactions(start: Date, end: Date): Promise<TransactionDetail[]> {
  const out: TransactionDetail[] = [];
  const WINDOW = 31 * 86400 * 1000 - 1000;
  for (let from = start.getTime(); from < end.getTime(); from += WINDOW) {
    const to = Math.min(end.getTime(), from + WINDOW);
    for (let page = 1; ; page++) {
      const res = await paypal<{ transaction_details: TransactionDetail[]; total_pages: number }>("/v1/reporting/transactions", {
        query: { start_date: new Date(from).toISOString(), end_date: new Date(to).toISOString(), fields: "all", page_size: 500, page },
      });
      out.push(...(res.transaction_details ?? []));
      if (page >= (res.total_pages ?? 1)) break;
    }
  }
  return out;
}

// ---------- Webhooks ----------
export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID must be set to verify webhooks");
  const res = await paypal<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: headers.get("paypal-auth-algo"), cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"), transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"), webhook_id: webhookId, webhook_event: JSON.parse(rawBody),
    },
  });
  return res.verification_status === "SUCCESS";
}
