import {
  loadUciLines, weeklySeries, fitDemand, profileCustomers, forecast, detectPriceChanges, didEffect, backtest,
  SEGMENT_LABELS, quantile, type PurchaseLine, type WeekPoint, type SegmentId, type DemandModel, type ForecastResult,
} from "@/lib/engine";
import { db } from "@/lib/db";

/** How strongly each customer group reacts relative to the product's overall price sensitivity. */
export const GROUP_SENSITIVITY: Record<SegmentId, number> = { regulars: 0.7, bulk: 1.3, new: 1.1, occasional: 1.2 };
const SEGMENT_ORDER: SegmentId[] = ["regulars", "bulk", "occasional", "new"];
const RECENT_WEEKS = 12;
const DAY = 86400000;

type Cache = {
  lines: PurchaseLine[];
  byCode: Map<string, PurchaseLine[]>;
  series: Map<string, WeekPoint[]>;
  asOf: Date;
  profiles: ReturnType<typeof profileCustomers>;
  catalog: CatalogItem[];
  models: Map<string, DemandModel>;
};
export type CatalogItem = { code: string; description: string; lastListPrice: number; weeklyUnits: number; lines: number };

const g = globalThis as unknown as { __sakaShop?: Cache };

function cache(): Cache {
  if (g.__sakaShop) return g.__sakaShop;
  const lines = loadUciLines();
  const byCode = new Map<string, PurchaseLine[]>();
  for (const l of lines) (byCode.get(l.stockCode) ?? byCode.set(l.stockCode, []).get(l.stockCode)!).push(l);
  const series = new Map<string, WeekPoint[]>();
  for (const [code, ls] of byCode) series.set(code, weeklySeries(ls));
  const asOf = new Date(Math.max(...lines.map((l) => l.date.getTime())));
  const profiles = profileCustomers(lines, asOf);
  const catalog = [...byCode.entries()].map(([code, ls]) => {
    const s = series.get(code)!;
    const counts = new Map<string, number>();
    for (const l of ls) counts.set(l.description, (counts.get(l.description) ?? 0) + 1);
    const recent = s.slice(-RECENT_WEEKS);
    return {
      code,
      description: titleCase([...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]),
      lastListPrice: s[s.length - 1].listPrice,
      weeklyUnits: recent.reduce((t, p) => t + p.units, 0) / RECENT_WEEKS,
      lines: ls.length,
    };
  }).sort((a, b) => b.lines - a.lines);
  g.__sakaShop = { lines, byCode, series, asOf, profiles, catalog, models: new Map() };
  return g.__sakaShop;
}

const SMALL = new Set(["of", "and", "the", "in", "with", "a"]);
function titleCase(s: string) {
  return s.toLowerCase().replace(/\b[a-z]+/g, (w, i) => (i > 0 && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1))).trim();
}

export const catalog = () => cache().catalog;

export function product(code: string) {
  const c = cache();
  const item = c.catalog.find((p) => p.code === code);
  if (!item) return null;
  return { item, lines: c.byCode.get(code)!, series: c.series.get(code)! };
}

export function model(code: string): DemandModel {
  const c = cache();
  if (!c.models.has(code)) c.models.set(code, fitDemand(c.series.get(code)!));
  return c.models.get(code)!;
}

/** Price the store charges today: the latest approved rollout, otherwise the last list price in history. */
export function currentPrice(code: string): { price: number; since: string; source: "history" | "rollout" } {
  const row = db().prepare("select price, set_at from prices where code = ? and active = 1 order by id desc limit 1").get(code) as { price: number; set_at: string } | undefined;
  if (row) return { price: row.price, since: row.set_at, source: "rollout" };
  const s = cache().series.get(code)!;
  let i = s.length - 1;
  while (i > 0 && s[i - 1].listPrice === s[s.length - 1].listPrice) i--;
  return { price: s[s.length - 1].listPrice, since: s[i].weekStart, source: "history" };
}

/** Recent buying by customer group for one product. */
export function groups(code: string) {
  const c = cache();
  const ls = c.byCode.get(code)!;
  const from = c.asOf.getTime() - RECENT_WEEKS * 7 * DAY;
  const agg = new Map<SegmentId, { units: number; customers: Set<string>; orders: Set<string>; qty: number[] }>();
  for (const id of SEGMENT_ORDER) agg.set(id, { units: 0, customers: new Set(), orders: new Set(), qty: [] });
  for (const l of ls) {
    if (l.date.getTime() <= from) continue;
    const seg = c.profiles.get(l.customerId)?.segment ?? "occasional";
    const a = agg.get(seg)!;
    a.units += l.quantity; a.customers.add(l.customerId); a.orders.add(l.invoice); a.qty.push(l.quantity);
  }
  const total = [...agg.values()].reduce((t, a) => t + a.units, 0) || 1;
  return SEGMENT_ORDER.map((id) => {
    const a = agg.get(id)!;
    const q = [...a.qty].sort((x, y) => x - y);
    return {
      id, name: SEGMENT_LABELS[id].name, description: SEGMENT_LABELS[id].description,
      customers: a.customers.size, orders: a.orders.size, weeklyUnits: a.units / RECENT_WEEKS,
      share: a.units / total, typicalQty: q.length ? quantile(q, 0.5) : 0, sensitivity: GROUP_SENSITIVITY[id],
    };
  });
}

export function typicalOrderQty(code: string) {
  const c = cache();
  const from = c.asOf.getTime() - 26 * 7 * DAY;
  const q = c.byCode.get(code)!.filter((l) => l.date.getTime() > from).map((l) => l.quantity).sort((a, b) => a - b);
  return q.length ? Math.max(1, Math.round(quantile(q, 0.5))) : 1;
}

export type ForecastRequest = { code: string; newPrice: number; unitCost?: number; unitsPerOrder?: number };
export type ForecastView = ForecastResult & {
  currentPrice: number; newPrice: number; unitCost: number; unitsPerOrder: number;
  groups: (ReturnType<typeof groups>[number] & { retained: ForecastResult["bySegment"][number]["retained"]; units: ForecastResult["bySegment"][number]["units"] })[];
};

export function forecastFor(r: ForecastRequest): ForecastView {
  const m = model(r.code);
  const p0 = currentPrice(r.code).price;
  const unitCost = r.unitCost ?? defaultUnitCost(p0);
  const unitsPerOrder = r.unitsPerOrder ?? typicalOrderQty(r.code);
  const gs = groups(r.code).filter((x) => x.weeklyUnits > 0);
  const fc = forecast({
    currentPrice: p0, newPrice: r.newPrice, unitCost, unitsPerOrder,
    segments: gs.map((x) => ({ segment: x.id, weeklyUnits: x.weeklyUnits, elasticity: { mean: m.elasticity.mean * x.sensitivity, sd: m.elasticity.sd } })),
  });
  return {
    ...fc, currentPrice: p0, newPrice: r.newPrice, unitCost, unitsPerOrder,
    groups: gs.map((x) => { const s = fc.bySegment.find((b) => b.segment === x.id)!; return { ...x, retained: s.retained, units: s.units }; }),
  };
}

/** Assumed cost of goods when the seller has not entered one: half the current price. */
export const defaultUnitCost = (price: number) => Math.round(price * 0.5 * 100) / 100;

export function elasticityView(code: string) {
  const e = model(code).elasticity;
  const evidence = !e.observed ? "none" : e.sd < 0.35 ? "strong" : e.sd < 0.6 ? "some" : "weak";
  return { mean: e.mean, sd: e.sd, p10: e.mean - 1.2816 * e.sd, p90: e.mean + 1.2816 * e.sd, observed: e.observed, weeks: e.weeks, priceVariation: e.priceVariation, evidence };
}

/** Past list-price changes for this product, measured three ways, to show how much history can prove. */
export function historyFor(code: string) {
  const c = cache();
  const s = c.series.get(code)!;
  const changes = detectPriceChanges(code, s);
  const events = changes.map((ch) => {
    const family = c.catalog.filter((p) => detectPriceChanges(p.code, c.series.get(p.code)!).some((x) => x.weekStart === ch.weekStart)).map((p) => p.code);
    const windows = [4, 8, 12, 16].map((w) => {
      const d = didEffect(c.series, family, ch.weekStart, w);
      return { weeks: w, effect: d?.effect ?? null, controls: d?.controls ?? 0 };
    });
    let bt: ReturnType<typeof backtest> | null = null;
    try { bt = backtest(s, ch, 12); } catch { bt = null; }
    return {
      weekStart: ch.weekStart, from: ch.from, to: ch.to, pctChange: ch.pctChange,
      family: family.map((f) => ({ code: f, description: c.catalog.find((p) => p.code === f)!.description })),
      windows,
      predicted: bt ? bt.predictedEffect : null,
      actual: bt ? bt.actualEffect : null,
      withinRange: bt ? bt.withinRange : null,
    };
  });
  return { code, events, shop: shopHistorySummary() };
}

type ShopEvent = {
  code: string; description: string; weekStart: string; from: number; to: number; pctChange: number;
  windows: { weeks: number; effect: number | null }[]; predicted: { p10: number; p50: number; p90: number }; actual: number; withinRange: boolean;
};
let shopSummary: { events: number; withinRange: number; effectMin: number; effectMax: number; signFlips: number; list: ShopEvent[] } | null = null;
function shopHistorySummary() {
  if (shopSummary) return shopSummary;
  const c = cache();
  let within = 0, flips = 0, min = Infinity, max = -Infinity;
  const list: ShopEvent[] = [];
  for (const p of c.catalog) {
    const s = c.series.get(p.code)!;
    for (const ch of detectPriceChanges(p.code, s)) {
      let bt: ReturnType<typeof backtest>;
      try { bt = backtest(s, ch, 12); } catch { continue; }
      if (bt.withinRange) within++;
      const windows = [4, 8, 12, 16].map((w) => ({ weeks: w, effect: didEffect(c.series, [p.code], ch.weekStart, w)?.effect ?? null }));
      const effs = windows.map((w) => w.effect).filter((x): x is number => x != null);
      for (const e of effs) { min = Math.min(min, e); max = Math.max(max, e); }
      if (effs.some((e) => e > 0) && effs.some((e) => e < 0)) flips++;
      list.push({ code: p.code, description: p.description, weekStart: ch.weekStart, from: ch.from, to: ch.to, pctChange: ch.pctChange, windows, predicted: bt.predictedEffect, actual: bt.actualEffect, withinRange: bt.withinRange });
    }
  }
  list.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  shopSummary = { events: list.length, withinRange: within, effectMin: min, effectMax: max, signFlips: flips, list };
  return shopSummary;
}

export function overview(code: string) {
  const p = product(code);
  if (!p) return null;
  const cp = currentPrice(code);
  const upo = typicalOrderQty(code);
  const cost = defaultUnitCost(cp.price);
  const recent = p.series.slice(-RECENT_WEEKS);
  const c = cache();
  const from = c.asOf.getTime() - RECENT_WEEKS * 7 * DAY;
  const customers = new Set(p.lines.filter((l) => l.date.getTime() > from).map((l) => l.customerId)).size;
  const at10 = forecastFor({ code, newPrice: Math.round(cp.price * 1.1 * 100) / 100, unitCost: cost, unitsPerOrder: upo });
  return {
    code, description: p.item.description, currentPrice: cp, unitCost: cost, unitsPerOrder: upo,
    asOf: c.asOf.toISOString().slice(0, 10),
    series: p.series.map((w) => ({ weekStart: w.weekStart, units: w.units, listPrice: w.listPrice })),
    kpis: {
      weeklyUnits: recent.reduce((t, w) => t + w.units, 0) / RECENT_WEEKS,
      weeklyOrders: recent.reduce((t, w) => t + w.orders, 0) / RECENT_WEEKS,
      customers,
      monthlyProfit: at10.profit.base,
    },
    elasticity: elasticityView(code),
    at10: { newPrice: at10.newPrice, units: at10.units, profit: at10.profit, probProfitUp: at10.probProfitUp },
    groups: at10.groups,
  };
}
