/**
 * Live smoke test against the PayPal sandbox and Claude. Prints pass/fail per step, never secrets.
 * Usage: pnpm tsx --env-file=.env.local scripts/smoke-live.ts [--skip-ai] [--skip-writes]
 * Plan price updates (update-pricing-schemes) are optional: the sandbox currently rejects them with
 * PRICING_SCHEME_UPDATE_NOT_ALLOWED, so saka applies new prices through new plans and consent-first revise.
 */
import { getAccessToken, createOrder, createProduct, createPlan, getPlan, updatePlanPrice, listTransactions, PayPalError } from "../src/lib/paypal/client";
import { paypalToolkit, callPayPalTool } from "../src/lib/paypal/toolkit";
import { segmentVoices, advise } from "../src/lib/ai/claude";
import { loadUciLines, weeklySeries, fitDemand, profileCustomers, forecast, SEGMENT_LABELS, type SegmentId } from "../src/lib/engine";

const results: { step: string; ok: boolean; info: string; ms: number }[] = [];
async function step<T>(name: string, fn: () => Promise<T>, describe: (v: T) => string): Promise<T | undefined> {
  const t = Date.now();
  try {
    const v = await fn();
    results.push({ step: name, ok: true, info: describe(v), ms: Date.now() - t });
    return v;
  } catch (e) {
    const err = e as Error;
    const info = e instanceof PayPalError ? `${e.status} ${e.name}: ${e.message}${e.debugId ? ` (debug_id ${e.debugId})` : ""}${e.details ? ` ${JSON.stringify(e.details).slice(0, 300)}` : ""}` : `${err.name}: ${err.message}`;
    results.push({ step: name, ok: false, info, ms: Date.now() - t });
  }
}

async function main() {
  const skipAi = process.argv.includes("--skip-ai");
  const skipWrites = process.argv.includes("--skip-writes");
  const tag = `smoke-${new Date().toISOString().slice(0, 16)}`;

  await step("PayPal OAuth token", getAccessToken, (t) => `token received (${t.length} chars)`);

  if (!skipWrites) {
  await step("PayPal Orders: create GBP order", () => createOrder({ amount: 2.08, currency: "GBP", description: "saka smoke test", customId: tag }),
    (o) => `order ${o.id} status ${o.status}, approve link ${o.links.some((l) => l.rel === "approve" || l.rel === "payer-action") ? "present" : "missing"}`);

  const product = await step("PayPal Catalog: create product", () => createProduct({ name: "saka smoke test box", description: tag, type: "PHYSICAL" }), (p) => `product ${p.id}`);
  const plan = product ? await step("PayPal Plans: create plan with intro offer", () =>
    createPlan({ productId: product.id, name: `saka smoke ${tag}`, monthlyPrice: 18, currency: "GBP", intro: { price: 12, months: 1 } }),
    (p) => `plan ${p.id} ${p.status}, cycles ${p.billing_cycles?.map((c) => `${c.tenure_type}:${c.pricing_scheme.fixed_price.value}`).join(" ") ?? "(not returned)"}`) : undefined;
  if (plan) {
    // Optional: report the outcome without failing the run.
    try { await updatePlanPrice(await getPlan(plan.id), 17.5); results.push({ step: "PayPal Plans: update price (optional)", ok: true, info: "allowed on this account", ms: 0 }); }
    catch (e) { results.push({ step: "PayPal Plans: update price (optional)", ok: true, info: `not allowed on this account (${e instanceof PayPalError ? (e.details as { issue?: string }[])?.[0]?.issue : (e as Error).message}); using new plan + revise instead`, ms: 0 }); }
  }
  }

  await step("PayPal Reporting: transaction search (last 30 days)", () => listTransactions(new Date(Date.now() - 30 * 86400000), new Date()),
    (txs) => `${txs.length} transactions`);

  const tk = await step("Agent Toolkit: connect in-process MCP", paypalToolkit, (s) => `${s.tools.length} read-only tools`);
  if (tk) {
    await step("Agent Toolkit: list_subscription_plans", () => callPayPalTool("list_subscription_plans", {}), (r) => `${r.isError ? "ERROR " : ""}${r.text.slice(0, 160).replace(/\s+/g, " ")}`);
    await step("Agent Toolkit: list_transactions", () => callPayPalTool("list_transactions", {}), (r) => `${r.isError ? "ERROR " : ""}${r.text.slice(0, 160).replace(/\s+/g, " ")}`);
  }

  // Engine on real history, then Claude.
  const lines = loadUciLines();
  const code = "85099B";
  const productLines = lines.filter((l) => l.stockCode === code);
  const series = weeklySeries(productLines);
  const model = fitDemand(series);
  const asOf = new Date(series[series.length - 1].weekStart);
  const profiles = profileCustomers(lines, asOf);
  const recent = productLines.filter((l) => l.date.getTime() > asOf.getTime() - 84 * 86400000);
  const bySeg = new Map<SegmentId, number>();
  for (const l of recent) { const s = profiles.get(l.customerId)?.segment ?? "occasional"; bySeg.set(s, (bySeg.get(s) ?? 0) + l.quantity); }
  const p0 = series[series.length - 1].listPrice, p1 = Math.round(p0 * 1.1 * 100) / 100;
  const sensitivity: Record<SegmentId, number> = { regulars: 0.7, bulk: 1.3, new: 1.1, occasional: 1.2 }; // relative to the product's elasticity
  const segs = [...bySeg].map(([segment, units]) => ({ segment, weeklyUnits: units / 12, elasticity: { mean: model.elasticity.mean * sensitivity[segment], sd: model.elasticity.sd } }));
  const fc = forecast({ currentPrice: p0, newPrice: p1, unitCost: p0 * 0.5, unitsPerOrder: 6, segments: segs });
  const total = segs.reduce((s, g) => s + g.weeklyUnits, 0);
  results.push({ step: "Engine: forecast on real history", ok: true, ms: 0,
    info: `${productLines[0].description} £${p0} -> £${p1}: units p50 ${fc.units.p50.toFixed(0)} vs ${fc.units.base.toFixed(0)}, profit p50 £${fc.profit.p50.toFixed(0)} vs £${fc.profit.base.toFixed(0)}, P(profit up) ${(fc.probProfitUp * 100).toFixed(0)}%` });

  if (!skipAi) {
    await step("Claude: segment voices (structured output)", () => segmentVoices({
      product: productLines[0].description, currency: "£", currentPrice: p0, newPrice: p1,
      segments: fc.bySegment.map((s) => ({ segment: s.segment, name: SEGMENT_LABELS[s.segment].name, description: SEGMENT_LABELS[s.segment].description,
        share: (bySeg.get(s.segment) ?? 0) / 12 / total, retainedP50: s.retained.p50, retainedP10: s.retained.p10, retainedP90: s.retained.p90 })),
    }), (v) => `"${v.headline}" | ${v.segments.length} segments, e.g. ${v.segments[0]?.segment}: "${v.segments[0]?.reactions[0]}"`);

    await step("Claude + Agent Toolkit: pricing advisor", () => advise({
      product: productLines[0].description, currency: "£", currentPrice: p0, candidatePrice: p1, usePayPalData: true,
      forecastSummary: `Monthly units ${fc.units.base.toFixed(0)} now; at the new price median ${fc.units.p50.toFixed(0)} (80% range ${fc.units.p10.toFixed(0)}-${fc.units.p90.toFixed(0)}). ` +
        `Monthly profit after PayPal fees £${fc.profit.base.toFixed(0)} now; median £${fc.profit.p50.toFixed(0)} (80% range £${fc.profit.p10.toFixed(0)}-£${fc.profit.p90.toFixed(0)}). ` +
        `Chance profit rises: ${(fc.probProfitUp * 100).toFixed(0)}%. Price-sensitivity evidence from history is weak (wide range).`,
    }), (r) => `PayPal tools used: [${r.paypalToolsUsed.join(", ") || "none"}] | ${r.proposals.length} proposals: ${r.proposals.map((p) => p.kind).join(", ")} | "${r.summary.slice(0, 140)}"`);
  }

  console.log("");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step.padEnd(52)} ${(r.ms / 1000).toFixed(1).padStart(5)}s  ${r.info}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
main();
