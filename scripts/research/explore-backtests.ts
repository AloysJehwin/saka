/** Print detected price changes and backtest results on the real UCI history. */
import { loadUciLines, weeklySeries, detectPriceChanges, backtest } from "../../src/lib/engine";

const lines = loadUciLines();
const byCode = new Map<string, typeof lines>();
for (const l of lines) (byCode.get(l.stockCode) ?? byCode.set(l.stockCode, []).get(l.stockCode)!).push(l);

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
let n = 0, inRange = 0;
for (const [code, ls] of byCode) {
  const series = weeklySeries(ls);
  for (const ch of detectPriceChanges(code, series)) {
    const train = series.filter((p) => p.weekStart < ch.weekStart).length;
    if (train < 30) continue;
    const r = backtest(series, ch, 12);
    n++; if (r.withinRange) inRange++;
    console.log(`${code.padEnd(7)} ${ls[0].description.slice(0, 30).padEnd(30)} ${ch.weekStart} ${ch.from}->${ch.to} (${pct(ch.pctChange)}) ` +
      `elast ${r.model.elasticity.mean.toFixed(2)}±${r.model.elasticity.sd.toFixed(2)} obs=${r.model.elasticity.observed?.estimate.toFixed(2) ?? "-"} | ` +
      `pred effect ${pct(r.predictedEffect.p50)} [${pct(r.predictedEffect.p10)}, ${pct(r.predictedEffect.p90)}] actual ${pct(r.actualEffect)} ${r.withinRange ? "IN" : "out"}`);
  }
}
console.log(`\n${n} backtestable changes, ${inRange} with actual effect inside the 80% range`);
