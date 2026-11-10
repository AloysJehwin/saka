import type { SegmentId } from "./types";
import { mulberry32, normalSampler, quantile } from "./stats";

export type FeeModel = { pct: number; fixed: number }; // PayPal fee per transaction
export const DEFAULT_FEE: FeeModel = { pct: 0.029, fixed: 0.3 };

export type SegmentInput = { segment: SegmentId; weeklyUnits: number; elasticity: { mean: number; sd: number } };

export type ForecastInput = {
  currentPrice: number;
  newPrice: number;
  unitCost: number;
  unitsPerOrder: number;
  fee?: FeeModel;
  segments: SegmentInput[];
  weeks?: number; // horizon, default ~1 month
  draws?: number;
  seed?: number;
};

export type Band = { p10: number; p50: number; p90: number; base: number };
export type SegmentForecast = { segment: SegmentId; baseUnits: number; retained: Band; units: Band };
export type ForecastResult = {
  units: Band; revenue: Band; profit: Band;
  probProfitUp: number; probRevenueUp: number;
  bySegment: SegmentForecast[];
};

const band = (xs: number[], base: number): Band => {
  const s = [...xs].sort((a, b) => a - b);
  return { p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9), base };
};

/** Profit per unit after cost and the PayPal fee (fixed fee spread over the units in an order). */
export const unitProfit = (price: number, unitCost: number, unitsPerOrder: number, fee: FeeModel) =>
  price - unitCost - (fee.pct * price + fee.fixed / Math.max(1, unitsPerOrder));

/** Monte Carlo forecast over each segment's elasticity uncertainty. */
export function forecast(input: ForecastInput): ForecastResult {
  const { currentPrice: p0, newPrice: p1, unitCost, unitsPerOrder } = input;
  const fee = input.fee ?? DEFAULT_FEE, weeks = input.weeks ?? 4.345, draws = input.draws ?? 4000;
  const normal = normalSampler(mulberry32(input.seed ?? 7));
  const ratio = p1 / p0;

  const baseUnits = input.segments.reduce((s, g) => s + g.weeklyUnits * weeks, 0);
  const baseRevenue = baseUnits * p0;
  const baseProfit = baseUnits * unitProfit(p0, unitCost, unitsPerOrder, fee);
  const newUnitProfit = unitProfit(p1, unitCost, unitsPerOrder, fee);

  const totUnits: number[] = [], rev: number[] = [], prof: number[] = [];
  const segUnits = input.segments.map(() => [] as number[]);
  const segRet = input.segments.map(() => [] as number[]);
  for (let d = 0; d < draws; d++) {
    let u = 0;
    input.segments.forEach((g, i) => {
      const e = Math.min(0.5, normal(g.elasticity.mean, g.elasticity.sd)); // demand never rises steeply with price
      const kept = Math.pow(ratio, e);
      const units = g.weeklyUnits * weeks * kept;
      segUnits[i].push(units);
      segRet[i].push(kept);
      u += units;
    });
    totUnits.push(u);
    rev.push(u * p1);
    prof.push(u * newUnitProfit);
  }
  return {
    units: band(totUnits, baseUnits),
    revenue: band(rev, baseRevenue),
    profit: band(prof, baseProfit),
    probProfitUp: prof.filter((x) => x > baseProfit).length / draws,
    probRevenueUp: rev.filter((x) => x > baseRevenue).length / draws,
    bySegment: input.segments.map((g, i) => ({
      segment: g.segment,
      baseUnits: g.weeklyUnits * weeks,
      units: band(segUnits[i], g.weeklyUnits * weeks),
      retained: band(segRet[i], 1),
    })),
  };
}
