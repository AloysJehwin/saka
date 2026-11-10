import type { PriceChange, WeekPoint } from "./types";
import { fitDemand, predictUnits, ELASTICITY_PRIOR, type DemandModel } from "./elasticity";
import { mulberry32, normalSampler, quantile } from "./stats";

export type BacktestWeek = { weekStart: string; actual: number; predicted: number; noChange: number };
export type BacktestResult = {
  change: PriceChange;
  trainWeeks: number;
  model: DemandModel;
  weeks: BacktestWeek[];
  totals: { actual: number; predicted: number; noChange: number };
  /** Price effect = units at new price vs what the same model expects at the old price. */
  predictedEffect: { p10: number; p50: number; p90: number };
  actualEffect: number;
  withinRange: boolean;
};

/**
 * Fit only on weeks before a real price change, then predict the weeks after it.
 * Compares the predicted price effect with the observed one (actual vs the no-change counterfactual).
 */
export function backtest(series: WeekPoint[], change: PriceChange, horizonWeeks = 12, prior = ELASTICITY_PRIOR): BacktestResult {
  const train = series.filter((p) => p.weekStart < change.weekStart);
  const test = series.filter((p) => p.weekStart >= change.weekStart).slice(0, horizonWeeks);
  const model = fitDemand(train, prior);

  const weeks = test.map((p) => ({
    weekStart: p.weekStart,
    actual: p.units,
    predicted: predictUnits(model, p.weekStart, change.to),
    noChange: predictUnits(model, p.weekStart, change.from),
  }));
  const totals = weeks.reduce((t, w) => ({ actual: t.actual + w.actual, predicted: t.predicted + w.predicted, noChange: t.noChange + w.noChange }), { actual: 0, predicted: 0, noChange: 0 });

  const normal = normalSampler(mulberry32(11));
  const ratio = change.to / change.from;
  const effects = Array.from({ length: 4000 }, () => Math.pow(ratio, normal(model.elasticity.mean, model.elasticity.sd)) - 1).sort((a, b) => a - b);
  const predictedEffect = { p10: quantile(effects, 0.1), p50: quantile(effects, 0.5), p90: quantile(effects, 0.9) };
  const actualEffect = totals.actual / totals.noChange - 1;

  return {
    change, trainWeeks: train.length, model, weeks, totals, predictedEffect, actualEffect,
    withinRange: actualEffect >= predictedEffect.p10 && actualEffect <= predictedEffect.p90,
  };
}

/**
 * Observed price effect using difference-in-differences: change in the treated products' units
 * (post window vs pre window) relative to the same change for control products whose price did not move.
 * Cancels seasonality and shop-wide swings that a single-product model cannot separate from price.
 */
export function didEffect(
  seriesByCode: Map<string, WeekPoint[]>,
  treated: string[],
  changeWeek: string,
  window = 8,
  metric: "units" | "orders" = "units",
): { effect: number; treatedRatio: number; controlRatio: number; controls: number } | null {
  const t0 = Date.parse(changeWeek);
  const W = window * 7 * 86400 * 1000;
  const inPre = (w: string) => { const t = Date.parse(w); return t >= t0 - W && t < t0; };
  const inPost = (w: string) => { const t = Date.parse(w); return t >= t0 && t < t0 + W; };
  const stablePrice = (s: WeekPoint[]) => {
    const prices = new Set(s.filter((p) => inPre(p.weekStart) || inPost(p.weekStart)).map((p) => p.listPrice));
    return prices.size === 1;
  };
  const sums = (codes: string[]) => codes.reduce((acc, c) => {
    const s = seriesByCode.get(c) ?? [];
    for (const p of s) { const v = p[metric]; if (inPre(p.weekStart)) acc.pre += v; else if (inPost(p.weekStart)) acc.post += v; }
    return acc;
  }, { pre: 0, post: 0 });

  const controls = [...seriesByCode.keys()].filter((c) => !treated.includes(c) && stablePrice(seriesByCode.get(c)!));
  const tr = sums(treated), co = sums(controls);
  if (tr.pre <= 0 || co.pre <= 0 || controls.length < 5) return null;
  const treatedRatio = tr.post / tr.pre, controlRatio = co.post / co.pre;
  return { effect: treatedRatio / controlRatio - 1, treatedRatio, controlRatio, controls: controls.length };
}
