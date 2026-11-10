import crypto from "node:crypto";
import { db, nowIso } from "@/lib/db";
import { evaluateCanary, priorProfitBand, type CanaryResult } from "@/lib/engine";
import { HttpError } from "./http";
import { currentPrice, elasticityView, model, product } from "./shop";

export type Arm = "control" | "test";
export type ExperimentRow = {
  id: string; code: string; product: string; control_price: number; test_price: number; share: number;
  unit_cost: number; units_per_order: number; prior_mean: number; prior_sd: number;
  status: "running" | "stopped_losing" | "ready" | "stopped" | "rolled_out"; decision: string | null; reason: string | null;
  created_by: string | null; created_at: string; stopped_at: string | null;
};

/** Simulated shoppers: how strongly they actually react (true price elasticity). Labelled as simulated everywhere. */
export const SCENARIOS = {
  calm: { label: "Shoppers barely react", elasticity: -0.3 },
  history: { label: "Shoppers react as history suggests", elasticity: null as number | null },
  sensitive: { label: "Shoppers react strongly", elasticity: -5 },
} as const;
export type Scenario = keyof typeof SCENARIOS;
const BASE_CONVERSION = 0.08;

export function getExperimentRow(id: string): ExperimentRow {
  const row = db().prepare("select * from experiments where id = ?").get(id) as ExperimentRow | undefined;
  if (!row) throw new HttpError(404, "That price test does not exist.");
  return row;
}

export function runningFor(code: string) {
  return db().prepare("select * from experiments where code = ? and status = 'running' order by created_at desc limit 1").get(code) as ExperimentRow | undefined;
}

export function createExperiment(p: { code: string; testPrice: number; share: number; unitCost: number; unitsPerOrder: number; userEmail: string }) {
  const prod = product(p.code);
  if (!prod) throw new HttpError(404, "Unknown product.");
  if (!(p.testPrice > 0)) throw new HttpError(400, "Enter a test price above zero.");
  if (!(p.share >= 0.05 && p.share <= 0.5)) throw new HttpError(400, "Show the test price to between 5% and 50% of shoppers.");
  const control = currentPrice(p.code).price;
  if (Math.abs(p.testPrice - control) < 0.005) throw new HttpError(400, "The test price must differ from today's price.");
  if (runningFor(p.code)) throw new HttpError(409, "A price test is already running for this product. Stop it first.");
  const prior = model(p.code).elasticity;
  const id = crypto.randomBytes(6).toString("hex");
  db().prepare(`insert into experiments(id, code, product, control_price, test_price, share, unit_cost, units_per_order, prior_mean, prior_sd, status, created_by, created_at)
    values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`)
    .run(id, p.code, prod.item.description, control, p.testPrice, p.share, p.unitCost, p.unitsPerOrder, prior.mean, prior.sd, p.userEmail, nowIso());
  return id;
}

type ArmStats = { price: number; views: number; purchases: number; revenue: number; realPurchases: number; simulatedViews: number; simulatedPurchases: number };

export function armStats(e: ExperimentRow): Record<Arm, ArmStats> {
  const rows = db().prepare(`select arm, kind, source, sum(count) as n, sum(coalesce(amount, 0)) as amt from events where experiment_id = ? group by arm, kind, source`).all(e.id) as { arm: Arm; kind: string; source: string; n: number; amt: number }[];
  const blank = (price: number): ArmStats => ({ price, views: 0, purchases: 0, revenue: 0, realPurchases: 0, simulatedViews: 0, simulatedPurchases: 0 });
  const out = { control: blank(e.control_price), test: blank(e.test_price) };
  for (const r of rows) {
    const a = out[r.arm];
    if (r.kind === "view") { a.views += r.n; if (r.source === "simulated") a.simulatedViews += r.n; }
    if (r.kind === "purchase") {
      a.purchases += r.n; a.revenue += r.amt;
      if (r.source === "simulated") a.simulatedPurchases += r.n; else a.realPurchases += r.n;
    }
  }
  return out;
}

function evaluate(e: ExperimentRow, stats = armStats(e)): CanaryResult {
  return evaluateCanary({
    prior: { mean: e.prior_mean, sd: e.prior_sd },
    control: { price: e.control_price, views: stats.control.views, purchases: stats.control.purchases },
    test: { price: e.test_price, views: stats.test.views, purchases: stats.test.purchases },
    unitCost: e.unit_cost, unitsPerOrder: e.units_per_order, draws: 12000,
  });
}

/** Re-evaluate after new data: record the range (so the UI can show it shrinking) and apply the stop rule. */
export function reevaluate(id: string) {
  const e = getExperimentRow(id);
  const stats = armStats(e);
  const r = evaluate(e, stats);
  const views = stats.control.views + stats.test.views, purchases = stats.control.purchases + stats.test.purchases;
  const last = db().prepare("select views, purchases from evaluations where experiment_id = ? order by id desc limit 1").get(id) as { views: number; purchases: number } | undefined;
  if (!last || last.views !== views || last.purchases !== purchases) {
    db().prepare(`insert into evaluations(experiment_id, at, views, purchases, p10, p50, p90, prob, e_p10, e_p90, decision) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, nowIso(), views, purchases, r.profitPerViewChange.p10, r.profitPerViewChange.p50, r.profitPerViewChange.p90, r.probTestBetter, r.elasticity.p10, r.elasticity.p90, r.decision);
  }
  if (e.status === "running" && r.decision !== "keep_testing") {
    db().prepare("update experiments set status = ?, decision = ?, reason = ?, stopped_at = ? where id = ?")
      .run(r.decision === "stop_test_is_losing" ? "stopped_losing" : "ready", r.decision, r.reason, nowIso(), id);
  }
  return r;
}

export function experimentView(id: string) {
  const e = getExperimentRow(id);
  const stats = armStats(e);
  const result = evaluate(e, stats);
  const history = db().prepare("select at, views, purchases, p10, p50, p90, prob, e_p10, e_p90, decision from evaluations where experiment_id = ? order by id").all(id);
  const events = db().prepare("select id, arm, kind, count, amount, order_id, source, created_at from events where experiment_id = ? order by id desc limit 40").all(id);
  const prior = priorProfitBand({ mean: e.prior_mean, sd: e.prior_sd }, e.control_price, e.test_price, e.unit_cost, e.units_per_order);
  const pe = elasticityView(e.code);
  return { experiment: e, stats, result, history, events, priorBand: prior, priorElasticity: { p10: pe.p10, p90: pe.p90, mean: pe.mean } };
}

export function listExperiments() {
  return db().prepare("select * from experiments order by created_at desc limit 30").all() as ExperimentRow[];
}

/** Which price a shopper sees. Once a test stops, everyone sees today's price. */
export function priceFor(e: ExperimentRow, arm: Arm) {
  if (e.status !== "running") return currentPrice(e.code).price;
  return arm === "test" ? e.test_price : e.control_price;
}

export function assignArm(e: ExperimentRow): Arm {
  return Math.random() < e.share ? "test" : "control";
}

export function recordView(id: string, arm: Arm) {
  db().prepare("insert into events(experiment_id, arm, kind, count, source, created_at) values(?, ?, 'view', 1, 'storefront', ?)").run(id, arm, nowIso());
  reevaluate(id);
}

/** Idempotent per PayPal order: the capture response and the webhook may both report the same purchase. */
export function recordPurchase(id: string, arm: Arm, orderId: string, amount: number, source: "paypal" | "webhook") {
  const res = db().prepare("insert or ignore into events(experiment_id, arm, kind, count, amount, order_id, source, created_at) values(?, ?, 'purchase', 1, ?, ?, ?, ?)")
    .run(id, arm, amount, orderId, source, nowIso());
  if (res.changes) reevaluate(id);
  return res.changes > 0;
}

function binomial(n: number, p: number) {
  if (n > 200) { // normal approximation keeps big batches fast
    const sd = Math.sqrt(n * p * (1 - p));
    const z = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
    return Math.max(0, Math.min(n, Math.round(n * p + z * sd)));
  }
  let k = 0;
  for (let i = 0; i < n; i++) if (Math.random() < p) k++;
  return k;
}

/** Add simulated shoppers in a few batches, re-evaluating after each so the range visibly narrows. */
export function simulate(id: string, visitors: number, scenario: Scenario) {
  const e = getExperimentRow(id);
  if (e.status !== "running") throw new HttpError(409, "This price test has stopped.");
  if (!(visitors >= 10 && visitors <= 2000)) throw new HttpError(400, "Simulate between 10 and 2,000 shoppers at a time.");
  const trueE = SCENARIOS[scenario]?.elasticity ?? e.prior_mean;
  const q0 = BASE_CONVERSION, q1 = Math.min(0.9, BASE_CONVERSION * Math.pow(e.test_price / e.control_price, trueE));
  const batches = Math.min(8, Math.max(3, Math.round(visitors / 150))), ins = db().prepare("insert into events(experiment_id, arm, kind, count, amount, source, created_at) values(?, ?, ?, ?, ?, 'simulated', ?)");
  let result: CanaryResult | null = null;
  for (let b = 0; b < batches; b++) {
    const n = Math.round(visitors / batches);
    const nTest = binomial(n, e.share), nControl = n - nTest;
    const kTest = binomial(nTest, q1), kControl = binomial(nControl, q0);
    const t = nowIso();
    ins.run(id, "control", "view", nControl, null, t);
    ins.run(id, "test", "view", nTest, null, t);
    if (kControl) ins.run(id, "control", "purchase", kControl, kControl * e.control_price * e.units_per_order, t);
    if (kTest) ins.run(id, "test", "purchase", kTest, kTest * e.test_price * e.units_per_order, t);
    result = reevaluate(id);
    if (getExperimentRow(id).status !== "running") break;
  }
  return result;
}

export function stopExperiment(id: string, userEmail: string) {
  const e = getExperimentRow(id);
  if (e.status !== "running") return;
  db().prepare("update experiments set status = 'stopped', reason = ?, stopped_at = ? where id = ?").run(`Stopped by ${userEmail}`, nowIso(), id);
}

export function markRolledOut(code: string) {
  db().prepare("update experiments set status = 'rolled_out' where code = ? and status = 'ready'").run(code);
}
