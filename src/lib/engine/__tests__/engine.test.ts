import { describe, it, expect } from "vitest";
import { fitDemand, predictUnits, detectPriceChanges, forecast, evaluateCanary, priorProfitBand, mulberry32, normalSampler, type WeekPoint } from "..";

/** Synthetic weekly demand with a known elasticity, seasonality and noise. */
function synth(trueE: number, weeks = 104, seed = 1): WeekPoint[] {
  const rand = mulberry32(seed), normal = normalSampler(rand);
  const out: WeekPoint[] = [];
  const start = Date.UTC(2010, 0, 4);
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start + i * 7 * 86400000);
    const price = [2, 2.2, 2.5, 1.8, 2.1][Math.floor(i / 9) % 5]; // not aligned with the calendar, so price is not confounded with season
    const season = 0.3 * Math.sin((2 * Math.PI * d.getUTCMonth()) / 12);
    const units = Math.round(Math.exp(5 + season + trueE * Math.log(price) + normal(0, 0.1)));
    out.push({ weekStart: d.toISOString().slice(0, 10), units, orders: units, listPrice: price });
  }
  return out;
}

describe("fitDemand", () => {
  it("recovers a known elasticity when prices vary", () => {
    const m = fitDemand(synth(-2));
    expect(m.elasticity.observed).not.toBeNull();
    expect(m.elasticity.mean).toBeGreaterThan(-2.3);
    expect(m.elasticity.mean).toBeLessThan(-1.7);
    expect(m.elasticity.sd).toBeLessThan(0.2);
  });
  it("falls back to the prior with wide uncertainty when price never changes", () => {
    const flat = synth(-2).map((p) => ({ ...p, listPrice: 2 }));
    const m = fitDemand(flat, { mean: -1.3, sd: 0.7 });
    expect(m.elasticity.observed).toBeNull();
    expect(m.elasticity.mean).toBe(-1.3);
    expect(m.elasticity.sd).toBe(0.7);
  });
  it("predicts fewer units at a higher price", () => {
    const m = fitDemand(synth(-1.5));
    expect(predictUnits(m, "2012-03-05", 2.5)).toBeLessThan(predictUnits(m, "2012-03-05", 2));
  });
});

describe("detectPriceChanges", () => {
  it("finds persistent steps and ignores short blips", () => {
    const s = synth(-1).map((p, i) => ({ ...p, listPrice: i < 30 ? 2 : i === 31 ? 9 : 2.5 }));
    const ch = detectPriceChanges("X", s, 8);
    expect(ch).toHaveLength(1);
    expect(ch[0].from).toBe(2);
    expect(ch[0].to).toBe(2.5);
  });
});

describe("forecast", () => {
  it("keeps 100% of units when the price does not change", () => {
    const r = forecast({ currentPrice: 2, newPrice: 2, unitCost: 1, unitsPerOrder: 2, segments: [{ segment: "regulars", weeklyUnits: 100, elasticity: { mean: -1.5, sd: 0.3 } }] });
    expect(r.units.p50).toBeCloseTo(r.units.base, 6);
  });
  it("loses more units from the more price-sensitive segment", () => {
    const r = forecast({ currentPrice: 2, newPrice: 2.4, unitCost: 1, unitsPerOrder: 2, segments: [
      { segment: "regulars", weeklyUnits: 100, elasticity: { mean: -0.8, sd: 0.1 } },
      { segment: "occasional", weeklyUnits: 100, elasticity: { mean: -2.5, sd: 0.1 } },
    ] });
    const [reg, occ] = r.bySegment;
    expect(occ.retained.p50).toBeLessThan(reg.retained.p50);
  });
});

describe("evaluateCanary", () => {
  const prior = { mean: -1.3, sd: 0.8 };
  it("narrows the elasticity estimate as checkout data arrives", () => {
    // Truth: elasticity -3 (very price sensitive). Control converts 10%; test at +20% converts 10% * 1.2^-3 = 5.8%.
    const r = evaluateCanary({ prior, unitCost: 1, control: { price: 10, views: 2000, purchases: 200 }, test: { price: 12, views: 2000, purchases: 116 } });
    expect(r.elasticity.sd).toBeLessThan(prior.sd * 0.65);
    expect(r.elasticity.mean).toBeLessThan(-2);
  });
  it("stops a losing test and graduates a winning one", () => {
    const losing = evaluateCanary({ prior, unitCost: 1, control: { price: 10, views: 2000, purchases: 200 }, test: { price: 12, views: 2000, purchases: 116 } });
    expect(losing.decision).toBe("stop_test_is_losing");
    const winning = evaluateCanary({ prior, unitCost: 6, control: { price: 10, views: 2000, purchases: 200 }, test: { price: 12, views: 2000, purchases: 195 } });
    expect(winning.decision).toBe("ready_to_roll_out");
  });
  it("waits for enough data", () => {
    const r = evaluateCanary({ prior, unitCost: 1, control: { price: 10, views: 10, purchases: 1 }, test: { price: 12, views: 10, purchases: 1 } });
    expect(r.decision).toBe("keep_testing");
  });
  it("prior band is wide before testing", () => {
    const b = priorProfitBand(prior, 10, 12, 6);
    expect(b.p90 - b.p10).toBeGreaterThan(0.2);
  });
});
