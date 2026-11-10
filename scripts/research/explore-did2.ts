/** Same events, measured on orders from retail-sized purchases only (quantity < 24), windows of 6/8/12 weeks. */
import { loadUciLines, weeklySeries, detectPriceChanges, didEffect, type PriceChange, type WeekPoint } from "../../src/lib/engine";

const all = loadUciLines();
const retail = all.filter((l) => l.quantity < 24);
const build = (ls: typeof all) => {
  const by = new Map<string, typeof all>();
  for (const l of ls) (by.get(l.stockCode) ?? by.set(l.stockCode, []).get(l.stockCode)!).push(l);
  return new Map([...by].map(([c, x]) => [c, weeklySeries(x)] as [string, WeekPoint[]]));
};
const sAll = build(all), sRetail = build(retail);
const changes: PriceChange[] = [...sAll].flatMap(([c, s]) => detectPriceChanges(c, s));
const events = new Map<string, PriceChange[]>();
for (const ch of changes) { const k = `${ch.weekStart}|${ch.pctChange.toFixed(3)}`; (events.get(k) ?? events.set(k, []).get(k)!).push(ch); }
const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(5);
for (const [k, chs] of [...events].sort()) {
  const [week] = k.split("|"); const codes = chs.map((c) => c.stockCode);
  const row = [6, 8, 12].map((w) => {
    const u = didEffect(sAll, codes, week, w, "units"), o = didEffect(sRetail, codes, week, w, "orders");
    return `w${w}: units ${u ? pct(u.effect) : "  n/a"} retailOrders ${o ? pct(o.effect) : "  n/a"}`;
  });
  console.log(`${week} ${pct(chs[0].pctChange)} x${chs.length}  ${row.join(" | ")}`);
}
