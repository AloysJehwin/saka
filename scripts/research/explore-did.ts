/** Group same-day price changes into events and measure their real effect with difference-in-differences. */
import { loadUciLines, weeklySeries, detectPriceChanges, didEffect, type PriceChange, type WeekPoint } from "../../src/lib/engine";

const lines = loadUciLines();
const series = new Map<string, WeekPoint[]>();
const desc = new Map<string, string>();
const byCode = new Map<string, typeof lines>();
for (const l of lines) (byCode.get(l.stockCode) ?? byCode.set(l.stockCode, []).get(l.stockCode)!).push(l);
for (const [c, ls] of byCode) { series.set(c, weeklySeries(ls)); desc.set(c, ls[0].description); }

const changes: PriceChange[] = [...series].flatMap(([c, s]) => detectPriceChanges(c, s));
const events = new Map<string, PriceChange[]>();
for (const ch of changes) { const k = `${ch.weekStart}|${ch.pctChange.toFixed(3)}`; (events.get(k) ?? events.set(k, []).get(k)!).push(ch); }

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
for (const [k, chs] of [...events].sort()) {
  const [week] = k.split("|");
  const r = didEffect(series, chs.map((c) => c.stockCode), week, 8);
  if (!r) continue;
  const implied = Math.log(1 + r.effect) / Math.log(1 + chs[0].pctChange);
  console.log(`${week} ${chs[0].from}->${chs[0].to} (${pct(chs[0].pctChange)}) x${chs.length} [${chs.map((c) => desc.get(c.stockCode)!.slice(0, 18)).join("; ")}] ` +
    `DiD effect ${pct(r.effect)} (treated x${r.treatedRatio.toFixed(2)} vs controls x${r.controlRatio.toFixed(2)}, n=${r.controls}) implied elasticity ${implied.toFixed(2)}`);
}
