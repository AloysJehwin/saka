import type { Elasticity, WeekPoint } from "./types";
import { ols, sd } from "./stats";

/** Typical own-price elasticity for small-shop retail goods, used when the data says little. */
export const ELASTICITY_PRIOR = { mean: -1.3, sd: 0.7 };

export type DemandModel = {
  elasticity: Elasticity;
  intercept: number;
  trendPerYear: number;
  monthEffect: Record<number, number>; // month (0-11) -> log effect vs baseline month
  smearing: number; // retransformation factor exp(sigma^2 / 2)
  origin: number; // ms timestamp of first training week, for the trend term
};

const MS_YEAR = 365.25 * 86400 * 1000;
const monthOf = (w: string) => new Date(w + "T00:00:00Z").getUTCMonth();

function design(series: WeekPoint[], origin: number, months: number[], withPrice: boolean) {
  return series.map((p) => {
    const row = [1, (Date.parse(p.weekStart) - origin) / MS_YEAR];
    for (const m of months) row.push(monthOf(p.weekStart) === m ? 1 : 0);
    if (withPrice) row.push(Math.log(p.listPrice));
    return row;
  });
}

/**
 * Fit weekly log-demand on log list price with trend and month-of-year effects, then combine the
 * data estimate with a prior (precision-weighted, i.e. Bayesian shrinkage). With little price variation
 * the estimate stays close to the prior and its uncertainty stays wide.
 */
export function fitDemand(series: WeekPoint[], prior = ELASTICITY_PRIOR): DemandModel {
  const data = series.filter((p) => p.units > 0 && p.listPrice > 0);
  if (data.length < 8) throw new Error(`not enough weeks to fit (${data.length})`);
  const origin = Date.parse(data[0].weekStart);
  const seen = new Set(data.map((p) => monthOf(p.weekStart)));
  const months = data.length >= 40 ? [...seen].filter((m) => m !== 0).sort((a, b) => a - b) : [];
  const y = data.map((p) => Math.log(p.units));
  const priceVariation = sd(data.map((p) => Math.log(p.listPrice)));

  let observed: Elasticity["observed"] = null;
  if (priceVariation > 0.005) {
    const fit = ols(design(data, origin, months, true), y);
    if (fit) {
      const k = fit.beta.length - 1;
      observed = { estimate: fit.beta[k], se: Math.sqrt(fit.cov[k][k]) };
    }
  }

  let post = { mean: prior.mean, sd: prior.sd };
  if (observed && Number.isFinite(observed.se) && observed.se > 0) {
    const pPrior = 1 / prior.sd ** 2, pData = 1 / observed.se ** 2;
    const v = 1 / (pPrior + pData);
    post = { mean: v * (prior.mean * pPrior + observed.estimate * pData), sd: Math.sqrt(v) };
  }

  // Refit the baseline with the elasticity fixed at its posterior mean, so predictions are consistent.
  const yAdj = data.map((p, i) => y[i] - post.mean * Math.log(p.listPrice));
  const base = ols(design(data, origin, months, false), yAdj);
  if (!base) throw new Error("baseline fit failed");
  const monthEffect: Record<number, number> = {};
  months.forEach((m, i) => (monthEffect[m] = base.beta[2 + i]));

  return {
    elasticity: { mean: post.mean, sd: post.sd, observed, weeks: data.length, priceVariation },
    intercept: base.beta[0],
    trendPerYear: base.beta[1],
    monthEffect,
    smearing: Math.exp(base.sigma2 / 2),
    origin,
  };
}

/** Expected units in a given week at a given list price. */
export function predictUnits(model: DemandModel, weekStartIso: string, price: number, elasticity = model.elasticity.mean) {
  const t = (Date.parse(weekStartIso) - model.origin) / MS_YEAR;
  const m = model.monthEffect[monthOf(weekStartIso)] ?? 0;
  return Math.exp(model.intercept + model.trendPerYear * t + m + elasticity * Math.log(price)) * model.smearing;
}
