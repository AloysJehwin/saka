"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, MessageSquareQuote } from "lucide-react";
import { useProduct, handoff } from "@/components/product-context";
import { api, useApi } from "@/lib/client/api";
import { PageHeader, Section, Button, Field, MoneyInput, inputCls, Loading, ErrorNote, Note } from "@/components/ui";
import { RangeBar, domainFor } from "@/components/charts";
import { gbp, gbp0, int, pct, pctPlain, round2 } from "@/lib/client/format";
import type { Overview, Forecast, SegmentVoices, AdvisorResult, Proposal } from "@/lib/client/types";

export default function WhatIfPage() {
  const { code } = useProduct();
  const o = useApi<Overview>(code ? `/api/products/${code}` : null);
  if (o.error) return <ErrorNote onRetry={o.reload}>{o.error}</ErrorNote>;
  if (!o.data) return <Loading />;
  return <WhatIf key={o.data.code} o={o.data} />;
}

function WhatIf({ o }: { o: Overview }) {
  const router = useRouter();
  const p0 = o.currentPrice.price;
  const [price, setPrice] = useState<number | "">(round2(p0 * 1.1));
  const [cost, setCost] = useState<number | "">(o.unitCost);
  const [upo, setUpo] = useState<number | "">(o.unitsPerOrder);
  const [fc, setFc] = useState<Forecast | null>(null);
  const [fcError, setFcError] = useState<string | null>(null);
  const [voices, setVoices] = useState<{ busy: boolean; data?: SegmentVoices; error?: string; forPrice?: number }>({ busy: false });
  const [advice, setAdvice] = useState<{ busy: boolean; data?: AdvisorResult; error?: string; forPrice?: number }>({ busy: false });
  const valid = typeof price === "number" && price > 0 && typeof cost === "number" && cost >= 0 && typeof upo === "number" && upo >= 1;
  const req = useMemo(() => (valid ? { code: o.code, newPrice: price as number, unitCost: cost as number, unitsPerOrder: upo as number } : null), [valid, o.code, price, cost, upo]);

  useEffect(() => {
    if (!req) return;
    const t = setTimeout(() => {
      api<Forecast>("/api/forecast", { body: req }).then((f) => { setFc(f); setFcError(null); }).catch((e) => setFcError(e.message));
    }, 180);
    return () => clearTimeout(t);
  }, [req]);

  const change = typeof price === "number" ? price / p0 - 1 : 0;
  const askGroups = async () => {
    if (!req) return;
    setVoices({ busy: true });
    try { setVoices({ busy: false, data: await api<SegmentVoices>("/api/ai/voices", { body: req }), forPrice: req.newPrice }); }
    catch (e) { setVoices({ busy: false, error: (e as Error).message }); }
  };
  const getAdvice = async () => {
    if (!req) return;
    setAdvice({ busy: true });
    try { setAdvice({ busy: false, data: await api<AdvisorResult>("/api/ai/advise", { body: req }), forPrice: req.newPrice }); }
    catch (e) { setAdvice({ busy: false, error: (e as Error).message }); }
  };

  return (
    <>
      <PageHeader
        title="Try a price"
        lede="Move the price and watch the ranges. The red tick is the likely result, the black bar the range we're 80% sure of, the hollow tick today."
        actions={valid && Math.abs(change) > 0.001 ? (
          <Button onClick={() => { handoff.set("price", { code: o.code, price, cost, upo }); router.push("/app/test"); }}>Test {gbp(price as number)} on real checkouts</Button>
        ) : undefined}
      />

      <div className="grid grid-cols-1 gap-x-12 gap-y-8 border-b border-rule pb-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <Field label="New price per unit" className="w-[180px]">
              <MoneyInput ariaLabel="New price" value={price} onChange={setPrice} />
            </Field>
            <p className="pb-2 text-[15px] num">
              <span className={`font-semibold ${change > 0 ? "text-red-ink" : change < 0 ? "text-ink" : "text-ink-3"}`}>{pct(change, 1)}</span>
              <span className="text-ink-3"> against today&apos;s {gbp(p0)}</span>
            </p>
          </div>
          <input type="range" className="price-slider mt-5" aria-label="Price" min={round2(p0 * 0.75)} max={round2(p0 * 1.35)} step={0.01}
            value={typeof price === "number" ? price : p0} onChange={(e) => setPrice(Number(e.target.value))} />
          <div className="mt-1 flex justify-between text-[12px] text-ink-3 num"><span>{gbp(p0 * 0.75)}</span><span>today {gbp(p0)}</span><span>{gbp(p0 * 1.35)}</span></div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[-0.1, 0.05, 0.1, 0.15, 0.2].map((s) => (
              <Button key={s} size="sm" tone="secondary" onClick={() => setPrice(round2(p0 * (1 + s)))}>{pct(s)}</Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Your cost per unit" hint="Assumed half of today's price until you enter yours."><MoneyInput ariaLabel="Unit cost" value={cost} onChange={setCost} /></Field>
          <Field label="Units in a typical order" hint="Spreads PayPal's fixed fee per order.">
            <input type="number" min={1} className={inputCls} value={upo} onChange={(e) => setUpo(e.target.value === "" ? "" : Number(e.target.value))} />
          </Field>
          <p className="col-span-2 text-[12px] text-ink-3">PayPal fee modelled at 2.9% + £0.30 per order. Horizon: one month.</p>
        </div>
      </div>

      {fcError && <div className="mt-6"><ErrorNote>{fcError}</ErrorNote></div>}
      {!fc ? <Loading label="Forecasting" /> : (
        <>
          <div className="grid grid-cols-1 gap-x-10 border-b border-rule md:grid-cols-2 xl:grid-cols-4">
            <Figure label="Profit a month after PayPal fees" band={fc.profit} format={gbp0} />
            <Figure label="Revenue a month" band={fc.revenue} format={gbp0} />
            <Figure label="Units a month" band={fc.units} format={int} />
            <div className="py-6">
              <p className="text-[13px] text-ink-2">Chance profit goes up</p>
              <p className={`mt-2 text-[56px] font-bold leading-none tracking-[-0.04em] num ${fc.probProfitUp >= 0.5 ? "text-ink" : "text-red-ink"}`}>{pctPlain(fc.probProfitUp)}</p>
              <p className="mt-2 text-[12px] text-ink-3">Revenue goes up: {pctPlain(fc.probRevenueUp)}</p>
            </div>
          </div>

          <Section className="mt-10" title="Who keeps buying" aside={`At ${gbp(fc.newPrice)} for one month`}>
            <GroupRisk fc={fc} />
          </Section>
        </>
      )}

      <div className="mt-12 grid grid-cols-1 gap-10 xl:grid-cols-2">
        <Section title="How each group might react" aside="Written by Claude from the numbers above">
          {voices.error && <ErrorNote onRetry={askGroups}>{voices.error}</ErrorNote>}
          {!voices.data && !voices.busy && !voices.error && (
            <EmptyAsk icon={<MessageSquareQuote className="size-5" strokeWidth={1.5} />} text="Hear the likely reaction of each customer group to this price, in their words. Claude only explains the forecast; it doesn't change the numbers." action={<Button onClick={askGroups} disabled={!req}>Ask the groups</Button>} />
          )}
          {voices.busy && <Loading label="Claude is writing each group's reaction" />}
          {voices.data && (
            <div>
              <p className="text-[18px] font-semibold leading-snug tracking-[-0.01em]">{voices.data.headline}</p>
              <ul className="mt-5 divide-y divide-rule border-y border-rule">
                {voices.data.segments.map((s) => (
                  <li key={s.segment} className="grid grid-cols-1 gap-2 py-4 md:grid-cols-[150px_1fr]">
                    <p className="font-semibold">{fc?.groups.find((g) => g.id === s.segment)?.name ?? s.segment}</p>
                    <div>
                      {s.reactions.map((r) => <p key={r} className="text-[15px] leading-relaxed">&ldquo;{r}&rdquo;</p>)}
                      <p className="mt-1 text-[13px] text-ink-3">{s.why}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between gap-4 text-[12px] text-ink-3">
                <span>For {gbp(voices.forPrice!)}.</span>
                {voices.forPrice !== price && <Button tone="quiet" onClick={askGroups}>Ask again for {typeof price === "number" ? gbp(price) : "this price"}</Button>}
              </div>
            </div>
          )}
        </Section>

        <Section title="Recommendation" aside="Claude reads your PayPal data, then proposes. You approve.">
          {advice.error && <ErrorNote onRetry={getAdvice}>{advice.error}</ErrorNote>}
          {!advice.data && !advice.busy && !advice.error && (
            <EmptyAsk icon={<Sparkles className="size-5" strokeWidth={1.5} />} text="Claude reads your sandbox transactions, plans and disputes through the PayPal Agent Toolkit (read-only), weighs this forecast and proposes what to do next. Nothing changes until you approve." action={<Button onClick={getAdvice} disabled={!req}>Get a recommendation</Button>} />
          )}
          {advice.busy && <Loading label="Claude is reading your PayPal data" />}
          {advice.data && (
            <div>
              <p className="text-[15px] leading-relaxed">{advice.data.summary}</p>
              {advice.data.paypalToolsUsed.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                  Read from PayPal:{advice.data.paypalToolsUsed.map((t) => <code key={t} className="border border-rule-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{t}</code>)}
                </p>
              )}
              <div className="mt-5 flex flex-col gap-4">
                {advice.data.proposals.map((p, i) => <ProposalCard key={i} p={p} code={o.code} fallbackPrice={advice.forPrice!} cost={cost} upo={upo} />)}
              </div>
            </div>
          )}
        </Section>
      </div>
      <div className="mt-10"><Note>Forecasts come from the statistics engine; Claude explains them and proposes actions but never sets the numbers.</Note></div>
    </>
  );
}

function Figure({ label, band, format }: { label: string; band: Forecast["profit"]; format: (n: number) => string }) {
  return (
    <div className="py-6">
      <p className="text-[13px] text-ink-2">{label}</p>
      <p className="mt-1 text-[12px] text-ink-3 num">today {format(band.base)}</p>
      <RangeBar low={band.p10} mid={band.p50} high={band.p90} base={band.base} domain={domainFor([band.p10, band.p90, band.base], 0.25)} format={format} label={label} />
    </div>
  );
}

function GroupRisk({ fc }: { fc: Forecast }) {
  const worst = Math.min(...fc.groups.map((g) => g.retained.p50));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[14px]">
        <thead>
          <tr className="border-b border-ink text-left text-[13px]">
            <th className="py-2 font-semibold">Group</th><th className="font-semibold">Share of units</th>
            <th className="w-[44%] font-semibold">Keep buying</th><th className="text-right font-semibold">Units a month</th>
          </tr>
        </thead>
        <tbody>
          {fc.groups.map((g) => (
            <tr key={g.id} className="border-b border-rule">
              <td className="py-3"><span className="font-semibold">{g.name}</span>{g.retained.p50 === worst && <span className="ml-2 text-[12px] font-semibold text-red-ink">Most at risk</span>}</td>
              <td className="num">{pctPlain(g.share)}</td>
              <td className="pr-6">
                <div className="flex items-center gap-3"><span className="w-11 text-right font-semibold num">{pctPlain(g.retained.p50)}</span>
                  <div className="flex-1"><RangeBar size="sm" low={g.retained.p10} mid={g.retained.p50} high={g.retained.p90} base={1} domain={[0.5, 1.15]} format={(v) => pctPlain(v)} label={g.name} /></div>
                </div>
              </td>
              <td className="text-right num">{int(g.units.p50)} <span className="text-ink-3">of {int(g.units.base)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyAsk({ icon, text, action }: { icon: ReactNode; text: string; action: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 border border-dashed border-rule-2 p-5">
      <span className="text-ink-2" aria-hidden>{icon}</span>
      <p className="max-w-[60ch] text-[14px] leading-relaxed text-ink-2">{text}</p>
      {action}
    </div>
  );
}

const KIND: Record<Proposal["kind"], { label: string; action: string }> = {
  start_canary: { label: "Test it on real checkouts", action: "Set up the price test" },
  new_customers_only: { label: "New price for new checkouts", action: "Review on Apply" },
  intro_offer: { label: "Intro offer on the Gift Box Club", action: "Review on Apply" },
  consent_switch: { label: "Ask subscribers to switch", action: "Review on Apply" },
  update_plan_price: { label: "Change the plan price for everyone", action: "Review on Apply" },
  hold_price: { label: "Keep today's price", action: "Accept" },
};

/** A proposal from Claude. Approving moves to the screen where the PayPal write is reviewed; dismissing keeps it visible, struck through. */
function ProposalCard({ p, code, fallbackPrice, cost, upo }: { p: Proposal; code: string; fallbackPrice: number; cost: number | ""; upo: number | "" }) {
  const router = useRouter();
  const [state, setState] = useState<"open" | "dismissed" | "accepted">("open");
  const k = KIND[p.kind];
  const approve = () => {
    if (p.kind === "hold_price") { setState("accepted"); return; }
    if (p.kind === "start_canary") {
      handoff.set("price", { code, price: p.newPrice ?? fallbackPrice, cost, upo, share: p.canaryShare ?? undefined });
      router.push("/app/test");
      return;
    }
    handoff.set("proposal", { ...p, code, newPrice: p.newPrice ?? fallbackPrice });
    router.push("/app/apply");
  };
  const done = state !== "open";
  return (
    <article className={`border p-4 ${state === "dismissed" ? "border-rule text-ink-3" : "border-ink"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={`text-[16px] font-semibold ${state === "dismissed" ? "line-through decoration-1" : ""}`}>{p.title}</h3>
        <span className="text-[12px] text-ink-3">{k.label}</span>
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px] num">
        {p.newPrice != null && <div><dt className="inline text-ink-3">Price </dt><dd className="inline font-semibold">{gbp(p.newPrice)}</dd></div>}
        {p.introPrice != null && <div><dt className="inline text-ink-3">Intro </dt><dd className="inline font-semibold">{gbp(p.introPrice)}{p.introMonths ? ` for ${p.introMonths} mo` : ""}</dd></div>}
        {p.canaryShare != null && <div><dt className="inline text-ink-3">Shoppers in test </dt><dd className="inline font-semibold">{pctPlain(p.canaryShare)}</dd></div>}
      </dl>
      <p className={`mt-3 text-[14px] leading-relaxed ${state === "dismissed" ? "line-through decoration-1" : ""}`}>{p.rationale}</p>
      <p className="mt-2 text-[13px] text-ink-2"><span className="font-semibold">Risk: </span>{p.risk}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!done && <Button size="sm" onClick={approve}>{k.action}</Button>}
        {!done && <Button size="sm" tone="quiet" onClick={() => setState("dismissed")}>Dismiss</Button>}
        {state === "dismissed" && <span className="text-[12px] font-semibold">Dismissed</span>}
        {state === "accepted" && <span className="text-[12px] font-semibold text-green">Accepted. No change made.</span>}
      </div>
    </article>
  );
}
