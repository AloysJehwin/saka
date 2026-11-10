"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { useProduct, handoff } from "@/components/product-context";
import { api, useApi } from "@/lib/client/api";
import { PageHeader, Section, Button, LinkButton, Field, MoneyInput, inputCls, Loading, ErrorNote, Note, Status } from "@/components/ui";
import { RangeBar, ChanceLine, domainFor } from "@/components/charts";
import { gbp, int, pct, pctPlain, round2, dateShort, timeShort, elast } from "@/lib/client/format";
import type { Overview, ExperimentView, ExperimentRow } from "@/lib/client/types";

type Handoff = { code: string; price: number; cost?: number; upo?: number; share?: number };

export default function TestPage() {
  const { code } = useProduct();
  const o = useApi<Overview>(code ? `/api/products/${code}` : null);
  const list = useApi<ExperimentRow[]>("/api/experiments");
  const [selected, setSelected] = useState<string | null>(null);

  if (o.error) return <ErrorNote onRetry={o.reload}>{o.error}</ErrorNote>;
  if (!o.data || !list.data) return <Loading />;
  const forProduct = list.data.filter((e) => e.code === o.data!.code);
  const activeId = selected ?? o.data.runningTest ?? null;

  return (
    <>
      {activeId ? (
        <RunningTest key={activeId} id={activeId} onClose={() => { setSelected(null); o.reload(); list.reload(); }} />
      ) : (
        <Setup o={o.data} onStarted={(id) => { setSelected(id); list.reload(); o.reload(); }} />
      )}
      {forProduct.length > 0 && (
        <Section className="mt-12" title="Tests for this product" aside="Stopped tests stay here, struck through, so the record is complete">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[14px]">
            <thead><tr className="border-b border-ink text-left text-[13px]"><th className="py-2 font-semibold">Started</th><th className="font-semibold">Today vs test</th><th className="font-semibold">Shoppers in test</th><th className="font-semibold">Outcome</th><th /></tr></thead>
            <tbody>
              {forProduct.map((e) => {
                const ended = e.status === "stopped" || e.status === "stopped_losing";
                return (
                  <tr key={e.id} className={`border-b border-rule ${ended ? "text-ink-3" : ""}`}>
                    <td className="py-2.5 num">{dateShort(e.created_at)}</td>
                    <td className={`num ${ended ? "line-through decoration-1" : ""}`}>{gbp(e.control_price)} vs {gbp(e.test_price)}</td>
                    <td className="num">{pctPlain(e.share)}</td>
                    <td><StatusFor status={e.status} /></td>
                    <td className="text-right">{e.id !== activeId && <Button size="sm" tone="quiet" onClick={() => setSelected(e.id)}>Open</Button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </Section>
      )}
    </>
  );
}

function StatusFor({ status }: { status: ExperimentRow["status"] }) {
  if (status === "running") return <Status tone="testing">Testing</Status>;
  if (status === "ready") return <Status tone="ready">Ready to roll out</Status>;
  if (status === "stopped_losing") return <Status tone="stop">Stopped: losing</Status>;
  if (status === "rolled_out") return <Status tone="done">Rolled out</Status>;
  return <Status tone="neutral">Stopped by you</Status>;
}

function Setup({ o, onStarted }: { o: Overview; onStarted: (id: string) => void }) {
  const p0 = o.currentPrice.price;
  const [price, setPrice] = useState<number | "">(round2(p0 * 1.1));
  const [share, setShare] = useState(0.5);
  const [cost, setCost] = useState<number | "">(o.unitCost);
  const [upo, setUpo] = useState<number | "">(o.unitsPerOrder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const h = handoff.take<Handoff>("price");
    if (h && h.code === o.code) {
      setPrice(h.price);
      if (h.cost !== undefined) setCost(h.cost);
      if (h.upo !== undefined) setUpo(h.upo);
      if (h.share) setShare([0.1, 0.2, 0.35, 0.5].reduce((a, b) => (Math.abs(b - h.share!) < Math.abs(a - h.share!) ? b : a)));
    }
  }, [o.code]);
  const valid = typeof price === "number" && price > 0 && Math.abs(price - p0) >= 0.01 && typeof cost === "number" && typeof upo === "number" && upo >= 1;
  const start = async () => {
    setBusy(true); setError(null);
    try { const r = await api<{ id: string }>("/api/experiments", { body: { code: o.code, testPrice: price, share, unitCost: cost, unitsPerOrder: upo } }); onStarted(r.id); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Test a price on real checkouts" lede={<>A share of new shoppers on the storefront see the test price; everyone else sees today&apos;s {gbp(p0)}. Every PayPal purchase updates the range. The test stops itself if the new price is losing, and tells you when it is ready.</>} />
      <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-5 self-start">
          <Field label="Today's price"><MoneyInput value={p0} onChange={() => {}} disabled ariaLabel="Today's price" /></Field>
          <Field label="Test price"><MoneyInput value={price} onChange={setPrice} ariaLabel="Test price" /></Field>
          <Field label="Shoppers who see the test price" className="col-span-2">
            <div className="flex">{[0.1, 0.2, 0.35, 0.5].map((s) => (
              <button key={s} type="button" onClick={() => setShare(s)} aria-pressed={share === s}
                className={`step h-10 flex-1 border text-[14px] font-medium [&+&]:-ml-px ${share === s ? "z-10 border-ink bg-ink text-paper" : "border-rule-2 bg-sheet hover:border-ink"}`}>{pctPlain(s)}</button>
            ))}</div>
          </Field>
          <Field label="Your cost per unit"><MoneyInput value={cost} onChange={setCost} ariaLabel="Unit cost" /></Field>
          <Field label="Units in a typical order"><input type="number" min={1} className={inputCls} value={upo} onChange={(e) => setUpo(e.target.value === "" ? "" : Number(e.target.value))} /></Field>
          <div className="col-span-2 mt-2 flex flex-wrap items-center gap-3">
            <Button onClick={start} busy={busy} disabled={!valid}>Start price test</Button>
            {typeof price === "number" && <span className="text-[13px] text-ink-3 num">{pct(price / p0 - 1, 1)} against today</span>}
          </div>
          {error && <div className="col-span-2"><ErrorNote>{error}</ErrorNote></div>}
        </div>
        <div className="border-t border-ink pt-4">
          <h2 className="text-[17px] font-semibold">How the test decides</h2>
          <ol className="mt-3 flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
            <li><b className="text-ink">Starting point.</b> The range from history: wide, because past price changes were noisy.</li>
            <li><b className="text-ink">Evidence.</b> Each storefront visit and each PayPal purchase at either price updates it (Bayesian update).</li>
            <li><b className="text-ink">Stop rule.</b> Under a 5% chance the new price wins: stop, everyone sees today&apos;s price. Over 95%: ready to roll out. At least 60 shoppers per price first.</li>
          </ol>
          <div className="mt-6"><Note>Without real traffic in the sandbox, you can add simulated shoppers on the next screen. They&apos;re labelled and counted apart from real PayPal checkouts.</Note></div>
        </div>
      </div>
    </>
  );
}

const SCENARIOS = [
  { id: "calm", label: "Shoppers barely react" },
  { id: "history", label: "Shoppers react as history suggests" },
  { id: "sensitive", label: "Shoppers react strongly" },
] as const;

function RunningTest({ id, onClose }: { id: string; onClose: () => void }) {
  const router = useRouter();
  const v = useApi<ExperimentView>(`/api/experiments/${id}`, 2500);
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]["id"]>("history");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ at: string; msg: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  if (v.error && !v.data) return <ErrorNote onRetry={v.reload}>{v.error}</ErrorNote>;
  if (!v.data) return <Loading label="Loading the price test" />;
  const { experiment: e, stats, result, history, events, priorBand, priorElasticity } = v.data;
  const running = e.status === "running";
  const storeUrl = typeof window !== "undefined" ? `${window.location.origin}/store/${e.id}` : `/store/${e.id}`;
  const ghosts = [{ low: priorBand.p10, high: priorBand.p90 }, ...history.slice(-7, -1).map((h) => ({ low: (h as { p10: number }).p10, high: (h as { p90: number }).p90 }))];
  const band = result.profitPerViewChange;
  const views = stats.control.views + stats.test.views;
  const real = stats.control.realPurchases + stats.test.realPurchases;

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setError(null);
    try { await fn(); await v.reload(); } catch (err) { setError({ at: label, msg: (err as Error).message }); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader
        title={<>{e.product}: {gbp(e.control_price)} vs <span className="text-red-ink">{gbp(e.test_price)}</span></>}
        lede={<>Started {dateShort(e.created_at)} by {e.created_by ?? "you"}. {pctPlain(e.share)} of new shoppers see the test price. {views === 0 ? "Waiting for the first shopper." : `${int(views)} shoppers so far, ${real} real PayPal ${real === 1 ? "purchase" : "purchases"}.`}</>}
        actions={<>
          <StatusFor status={e.status} />
          <LinkButton href={`/store/${e.id}`} external tone="secondary">Open storefront</LinkButton>
          <Button tone="secondary" onClick={() => { navigator.clipboard.writeText(storeUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }, () => setError({ at: "copy", msg: `Couldn't copy. The link is ${storeUrl}` })); }}>
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copied ? "Copied" : "Copy link"}
          </Button>
          {running && !confirmStop && <Button tone="danger" onClick={() => setConfirmStop(true)}>Stop test</Button>}
          {!running && <Button tone="quiet" onClick={onClose}>New test</Button>}
        </>}
      />

      {running && confirmStop && (
        <div role="alertdialog" aria-label="Stop this test?" className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border border-red px-4 py-3">
          <p className="text-[14px] text-ink">Stop the test? Every shopper goes back to <b className="num">{gbp(e.control_price)}</b>. A stopped test can&apos;t be restarted; you&apos;d start a new one.</p>
          <div className="flex items-center gap-2">
            <Button tone="danger" busy={busy === "stop"} onClick={() => act("stop", () => api(`/api/experiments/${id}/stop`, { body: {} })).then(() => setConfirmStop(false))}>Stop test</Button>
            <Button tone="secondary" onClick={() => setConfirmStop(false)} autoFocus>Keep running</Button>
          </div>
        </div>
      )}
      {error && !error.at.startsWith("sim") && <div className="mb-8"><ErrorNote>{error.msg}</ErrorNote></div>}
      {e.status === "ready" && (
        <Banner tone="ready" title={`Ready to roll out ${gbp(e.test_price)}`} text={result.reason}
          action={<Button onClick={() => { handoff.set("proposal", { kind: "new_customers_only", code: e.code, newPrice: e.test_price, title: `Roll out ${gbp(e.test_price)}`, rationale: result.reason, risk: "", introPrice: null, introMonths: null, canaryShare: null }); router.push("/app/apply"); }}>Review and apply</Button>} />
      )}
      {e.status === "stopped_losing" && <Banner tone="stop" title="Stopped automatically: the new price is losing" text={`${result.reason} Every shopper now sees ${gbp(e.control_price)}.`} />}

      <div className="grid grid-cols-1 gap-x-12 gap-y-8 border-b border-rule pb-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div>
          <h2 className="text-[17px] font-semibold">Profit per shopper, test price against today</h2>
          <p className="mt-1 text-[13px] text-ink-3">Faint marks are the wider ranges from earlier in the test, starting with history alone.</p>
          <div className="mt-4">
            <RangeBar low={band.p10} mid={band.p50} high={band.p90} ghosts={ghosts} domain={domainFor([priorBand.p10, priorBand.p90, band.p10, band.p90, 0], 0.08)} marks={[{ at: 0, label: "no change" }]} format={(x) => pct(x)} label="Profit per shopper change" />
          </div>
          <div className="mt-6">
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] text-ink-2">Chance the new price wins</p>
              <p className="text-[32px] font-bold leading-none tracking-[-0.03em] num">{pctPlain(result.probTestBetter)}</p>
            </div>
            <ChanceLine p={result.probTestBetter} />
          </div>
        </div>
        <div>
          <h2 className="text-[17px] font-semibold">Units change for a 1% price rise</h2>
          <p className="mt-1 text-[13px] text-ink-3">Grey: history alone. Black: with this test&apos;s evidence.</p>
          <div className="mt-4">
            <RangeBar low={result.elasticity.p10} mid={result.elasticity.mean} high={result.elasticity.p90} ghosts={[{ low: priorElasticity.p10, high: priorElasticity.p90 }]} domain={[-4, 0.5]} marks={[{ at: 0, label: "no reaction" }]} format={elast} label="Price sensitivity" />
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-2">{result.reason}</p>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section title="Both prices so far">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead><tr className="border-b border-ink text-left text-[13px]"><th className="py-2 font-semibold">Price</th><th className="text-right font-semibold">Shoppers</th><th className="text-right font-semibold">Purchases</th><th className="text-right font-semibold">Bought</th><th className="text-right font-semibold">Revenue</th><th className="text-right font-semibold">Real PayPal</th></tr></thead>
              <tbody>
                {(["control", "test"] as const).map((arm) => {
                  const a = stats[arm];
                  return (
                    <tr key={arm} className="border-b border-rule">
                      <td className="py-3"><span className={`font-semibold num ${arm === "test" ? "text-red-ink" : ""}`}>{gbp(a.price)}</span> <span className="text-ink-3">{arm === "test" ? "test" : "today"}</span></td>
                      <td className="text-right num">{int(a.views)}</td>
                      <td className="text-right num">{int(a.purchases)}</td>
                      <td className="text-right num">{a.views ? pctPlain(a.purchases / a.views, 1) : "–"}</td>
                      <td className="text-right num">{gbp(a.revenue)}</td>
                      <td className="text-right num">{a.realPurchases}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">Simulated: {int(stats.control.simulatedViews + stats.test.simulatedViews)} shoppers, {int(stats.control.simulatedPurchases + stats.test.simulatedPurchases)} purchases. Everything else came through the storefront and PayPal.</p>
        </Section>

        <Section title="Simulated shoppers" aside="For the sandbox, where real traffic is scarce">
          <Field label="How simulated shoppers behave">
            <select className={inputCls} value={scenario} onChange={(x) => setScenario(x.target.value as typeof scenario)} disabled={!running}>
              {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <div className="mt-4 flex flex-wrap gap-2">
            {[100, 500, 2000].map((n) => (
              <Button key={n} tone="secondary" disabled={!running} busy={busy === `sim${n}`} onClick={() => act(`sim${n}`, () => api(`/api/experiments/${id}/simulate`, { body: { visitors: n, scenario } }))}>Add {n.toLocaleString("en-GB")}</Button>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">Simulated shoppers buy 8% of the time at today&apos;s price. The test doesn&apos;t know which behaviour you picked; watch it find out. A small price change needs thousands of shoppers to settle, which is why the test keeps going rather than guessing. Real storefront checkouts always count.</p>
          {error?.at.startsWith("sim") && <div className="mt-3"><ErrorNote>{error.msg}</ErrorNote></div>}
        </Section>
      </div>

      <Section className="mt-10" title="What happened" aside="Newest first">
        {events.length === 0 ? <p className="text-[14px] text-ink-2">Nothing yet. Open the storefront, or add simulated shoppers.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead><tr className="border-b border-ink text-left"><th className="py-2 font-semibold">Time</th><th className="font-semibold">Price</th><th className="font-semibold">What</th><th className="font-semibold">Source</th><th className="text-right font-semibold">Amount</th></tr></thead>
              <tbody>
                {groupEvents(events as Ev[]).map((x) => (
                  <tr key={x.key} className="border-b border-rule">
                    <td className="py-2 num">{timeShort(x.at)}</td>
                    <td className={`num ${x.arm === "test" ? "text-red-ink" : ""}`}>{x.arm === "both" ? "Both" : gbp(x.arm === "test" ? e.test_price : e.control_price)}</td>
                    <td>{x.text}{x.orderId && <span className="ml-2 font-mono text-[11px] text-ink-3">{x.orderId}</span>}</td>
                    <td><SourceTag s={x.source} /></td>
                    <td className="text-right num">{x.amount != null ? gbp(x.amount) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

type Ev = { id: number; arm: "control" | "test"; kind: string; count: number; amount: number | null; order_id: string | null; source: string; created_at: string };
type Row = { key: string; at: string; arm: "control" | "test" | "both"; text: string; source: string; amount: number | null; orderId: string | null };
const plural = (n: number, one: string, many: string) => `${int(n)} ${n === 1 ? one : many}`;

/** Real events one per row; simulated batches added in the same second fold into one row. */
function groupEvents(events: Ev[]): Row[] {
  const rows: Row[] = [];
  for (const x of events) {
    if (x.source === "simulated") {
      const sec = x.created_at.slice(0, 19);
      let r = rows.find((y) => y.source === "simulated" && y.at.slice(0, 19) === sec);
      if (!r) { r = { key: `sim-${sec}`, at: x.created_at, arm: "both", text: "", source: "simulated", amount: 0, orderId: null }; rows.push(r); (r as Row & { v: number; p: number }).v = 0; (r as Row & { v: number; p: number }).p = 0; }
      const g = r as Row & { v: number; p: number };
      if (x.kind === "view") g.v += x.count; else { g.p += x.count; g.amount = (g.amount ?? 0) + (x.amount ?? 0); }
      g.text = `${plural(g.v, "shopper", "shoppers")}, ${plural(g.p, "purchase", "purchases")}`;
    } else {
      rows.push({ key: String(x.id), at: x.created_at, arm: x.arm, source: x.source, amount: x.amount, orderId: x.order_id,
        text: x.kind === "view" ? "A shopper saw the price" : plural(x.count, "purchase", "purchases") });
    }
  }
  return rows.slice(0, 15);
}

function SourceTag({ s }: { s: string }) {
  const label = s === "paypal" ? "PayPal checkout" : s === "webhook" ? "PayPal webhook" : s === "storefront" ? "Storefront" : "Simulated";
  return <span className={`text-[12px] ${s === "simulated" ? "text-ink-3" : "font-semibold"}`}>{label}</span>;
}

function Banner({ tone, title, text, action }: { tone: "ready" | "stop"; title: string; text: string; action?: ReactNode }) {
  return (
    <div role="status" className={`mb-8 flex flex-wrap items-center justify-between gap-4 border px-5 py-4 ${tone === "ready" ? "border-green" : "border-red"}`}>
      <div>
        <p className={`text-[16px] font-semibold ${tone === "ready" ? "text-green" : "text-red-ink"}`}>{title}</p>
        <p className="mt-1 text-[14px] text-ink-2">{text}</p>
      </div>
      {action}
    </div>
  );
}
