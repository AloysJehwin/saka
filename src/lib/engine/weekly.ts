import type { PurchaseLine, WeekPoint, PriceChange } from "./types";

export function weekStart(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (t.getUTCDay() + 6) % 7; // Monday = 0
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}

/** Weekly units, orders and list price (most common unit price by number of lines) for one product. */
export function weeklySeries(lines: PurchaseLine[]): WeekPoint[] {
  const weeks = new Map<string, { units: number; invoices: Set<string>; prices: Map<number, number> }>();
  for (const l of lines) {
    const w = weekStart(l.date);
    const e = weeks.get(w) ?? weeks.set(w, { units: 0, invoices: new Set(), prices: new Map() }).get(w)!;
    e.units += l.quantity;
    e.invoices.add(l.invoice);
    e.prices.set(l.unitPrice, (e.prices.get(l.unitPrice) ?? 0) + 1);
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([w, e]) => ({
    weekStart: w,
    units: e.units,
    orders: e.invoices.size,
    listPrice: [...e.prices.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0],
  }));
}

/**
 * Detect persistent list-price changes: the new price must hold (as the most common weekly price)
 * for at least `minWeeks` consecutive observed weeks, after holding the old price for `minWeeks` too.
 */
export function detectPriceChanges(stockCode: string, series: WeekPoint[], minWeeks = 8): PriceChange[] {
  const changes: PriceChange[] = [];
  let runStart = 0;
  const runs: { from: number; to: number; price: number }[] = [];
  for (let i = 1; i <= series.length; i++) {
    if (i === series.length || series[i].listPrice !== series[runStart].listPrice) {
      runs.push({ from: runStart, to: i - 1, price: series[runStart].listPrice });
      runStart = i;
    }
  }
  const long = runs.filter((r) => r.to - r.from + 1 >= minWeeks);
  for (let i = 1; i < long.length; i++) {
    if (long[i].price === long[i - 1].price) continue;
    const from = long[i - 1].price, to = long[i].price;
    changes.push({ stockCode, weekStart: series[long[i].from].weekStart, from, to, pctChange: (to - from) / from });
  }
  return changes;
}
