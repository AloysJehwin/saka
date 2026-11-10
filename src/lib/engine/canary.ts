import { mulberry32, normalSampler, quantile } from "./stats";
import { unitProfit, DEFAULT_FEE, type FeeModel } from "./forecast";

/**
 * Bayesian price canary.
 *
 * Prior: the elasticity learned from history (wide when history is uninformative).
 * Data: offer views and PayPal-captured purchases for the control price and the test price.
 * Posterior: importance-weighted draws. For each draw, elasticity e comes from the prior and the control
 * conversion rate q0 from its Beta posterior; the test conversion rate is implied as q1 = q0 * (p1/p0)^e,
 * and the draw is weighted by the binomial likelihood of the observed test purchases.
 */
export type CanaryArm = { price: number; views: number; purchases: number };
export type CanaryInput = {
  prior: { mean: number; sd: number };
  control: CanaryArm;
  test: CanaryArm;
  unitCost: number;
  unitsPerOrder?: number;
  fee?: FeeModel;
  draws?: number;
  seed?: number;
};
export type CanaryDecision = "keep_testing" | "stop_test_is_losing" | "ready_to_roll_out";
export type CanaryResult = {
  elasticity: { mean: number; sd: number; p10: number; p90: number };
  profitPerViewChange: { p10: number; p50: number; p90: number }; // test vs control, relative
  probTestBetter: number;
  effectiveSampleSize: number;
  decision: CanaryDecision;
  reason: string;
};

/** Gamma(shape, 1) sampler (Marsaglia-Tsang), used to draw Beta variables. */
function gammaSampler(rand: () => number) {
  const normal = normalSampler(rand);
  const g = (k: number): number => {
    if (k < 1) return g(k + 1) * Math.pow(rand(), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number, v: number;
      do { x = normal(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = rand();
      if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  return g;
}

export function evaluateCanary(input: CanaryInput, minViewsPerArm = 60): CanaryResult {
  const { prior, control, test, unitCost } = input;
  const fee = input.fee ?? DEFAULT_FEE, upo = input.unitsPerOrder ?? 1, n = input.draws ?? 20000;
  const rand = mulberry32(input.seed ?? 3);
  const normal = normalSampler(rand), gamma = gammaSampler(rand);
  const ratio = test.price / control.price;
  const m0 = unitProfit(control.price, unitCost, upo, fee), m1 = unitProfit(test.price, unitCost, upo, fee);

  const es: number[] = [], ws: number[] = [], changes: number[] = [];
  for (let i = 0; i < n; i++) {
    const e = normal(prior.mean, prior.sd);
    const a = gamma(control.purchases + 1), b = gamma(control.views - control.purchases + 1);
    const q0 = a / (a + b);
    const q1 = Math.min(0.999, Math.max(1e-6, q0 * Math.pow(ratio, e)));
    const logw = test.purchases * Math.log(q1) + (test.views - test.purchases) * Math.log(1 - q1);
    es.push(e); ws.push(logw);
    changes.push((q1 * m1) / (q0 * m0) - 1);
  }
  const maxLog = Math.max(...ws);
  const w = ws.map((x) => Math.exp(x - maxLog));
  const sumW = w.reduce((s, x) => s + x, 0);
  const ess = sumW ** 2 / w.reduce((s, x) => s + x * x, 0);

  const weighted = (vals: number[]) => {
    const idx = vals.map((v, i) => [v, w[i] / sumW] as const).sort((x, y) => x[0] - y[0]);
    const q = (p: number) => { let acc = 0; for (const [v, wt] of idx) { acc += wt; if (acc >= p) return v; } return idx[idx.length - 1][0]; };
    const mean = idx.reduce((s, [v, wt]) => s + v * wt, 0);
    const sd = Math.sqrt(idx.reduce((s, [v, wt]) => s + wt * (v - mean) ** 2, 0));
    return { mean, sd, p10: q(0.1), p50: q(0.5), p90: q(0.9) };
  };
  const el = weighted(es), ch = weighted(changes);
  const probTestBetter = changes.reduce((s, c, i) => s + (c > 0 ? w[i] : 0), 0) / sumW;

  let decision: CanaryDecision = "keep_testing";
  let reason = `Need at least ${minViewsPerArm} views per price before deciding.`;
  if (control.views >= minViewsPerArm && test.views >= minViewsPerArm) {
    if (probTestBetter < 0.05) { decision = "stop_test_is_losing"; reason = `Only ${(probTestBetter * 100).toFixed(0)}% chance the new price earns more per visitor.`; }
    else if (probTestBetter > 0.95) { decision = "ready_to_roll_out"; reason = `${(probTestBetter * 100).toFixed(0)}% chance the new price earns more per visitor.`; }
    else reason = `${(probTestBetter * 100).toFixed(0)}% chance the new price earns more per visitor. Not decisive yet.`;
  }
  return {
    elasticity: { mean: el.mean, sd: el.sd, p10: el.p10, p90: el.p90 },
    profitPerViewChange: { p10: ch.p10, p50: ch.p50, p90: ch.p90 },
    probTestBetter, effectiveSampleSize: ess, decision, reason,
  };
}

/** Prior-only view (no canary data yet), for the "before testing" band. */
export function priorProfitBand(prior: { mean: number; sd: number }, p0: number, p1: number, unitCost: number, unitsPerOrder = 1, fee = DEFAULT_FEE) {
  const normal = normalSampler(mulberry32(5));
  const m0 = unitProfit(p0, unitCost, unitsPerOrder, fee), m1 = unitProfit(p1, unitCost, unitsPerOrder, fee);
  const xs = Array.from({ length: 8000 }, () => Math.pow(p1 / p0, normal(prior.mean, prior.sd)) * (m1 / m0) - 1).sort((a, b) => a - b);
  return { p10: quantile(xs, 0.1), p50: quantile(xs, 0.5), p90: quantile(xs, 0.9) };
}
