"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useProduct, handoff } from "@/components/product-context";
import { useApi, api } from "@/lib/client/api";
import { PageHeader, Section, Button, Field, MoneyInput, inputCls, Loading, ErrorNote, Note, ApproveAction, LinkButton, Status } from "@/components/ui";
import { gbp, round2, dateShort, timeShort } from "@/lib/client/format";
import type { ClubState, Overview, Proposal } from "@/lib/client/types";

type Apply = {
  club: ClubState;
  actions: { id: number; kind: string; summary: string; result: string | null; ok: number; user_email: string | null; created_at: string }[];
  prices: { id: number; code: string; price: number; set_by: string | null; set_at: string; active: number }[];
};
type Handed = Proposal & { code: string };

export default function ApplyPage() {
  const { code } = useProduct();
  const o = useApi<Overview>(code ? `/api/products/${code}` : null);
  const a = useApi<Apply>("/api/apply");
  const [proposal, setProposal] = useState<Handed | null>(null);
  useEffect(() => { setProposal(handoff.take<Handed>("proposal")); }, []);

  return (
    <>
      <PageHeader title="Apply a price" lede="Each change below is a real write to PayPal (sandbox) or to your storefront. Read what will happen, then approve. Everything you approve is logged at the bottom." />
      {proposal && (
        <div className="mb-8 border border-ink px-5 py-4">
          <p className="text-[13px] text-ink-3">From the recommendation</p>
          <p className="text-[16px] font-semibold">{proposal.title}</p>
          {proposal.rationale && <p className="mt-1 max-w-[80ch] text-[14px] text-ink-2">{proposal.rationale}</p>}
        </div>
      )}
      {o.error && <ErrorNote onRetry={o.reload}>{o.error}</ErrorNote>}
      {a.error && <ErrorNote onRetry={a.reload}>{a.error}</ErrorNote>}
      {!o.data || !a.data ? <Loading /> : (
        <>
          <ProductRollout o={o.data} prices={a.data.prices.filter((p) => p.code === o.data!.code)} suggested={proposal?.kind === "new_customers_only" && proposal.code === o.data.code ? proposal.newPrice : null} onChange={() => { o.reload(); a.reload(); }} />
          <Club club={a.data.club} proposal={proposal} onChange={a.reload} />
          <Section className="mt-12" title="Activity" aside="Every change approved in saka">
            {a.data.actions.length === 0 ? <p className="text-[14px] text-ink-2">Nothing approved yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-[13px]">
                  <thead><tr className="border-b border-ink text-left"><th className="py-2 font-semibold">When</th><th className="font-semibold">Who</th><th className="font-semibold">What</th><th className="font-semibold">Result</th></tr></thead>
                  <tbody>
                    {a.data.actions.map((x) => (
                      <tr key={x.id} className="border-b border-rule align-top">
                        <td className="whitespace-nowrap py-2 pr-4 num">{dateShort(x.created_at)} {timeShort(x.created_at)}</td>
                        <td className="py-2 pr-4 text-ink-2">{x.user_email ?? "–"}</td>
                        <td className="py-2 pr-4">{x.summary}</td>
                        <td className="py-2">{x.ok ? <span className="font-semibold text-green">Done</span> : <span className="font-semibold text-red-ink" title={x.result ?? ""}>Refused by PayPal</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </>
  );
}

function ProductRollout({ o, prices, suggested, onChange }: { o: Overview; prices: Apply["prices"]; suggested: number | null; onChange: () => void }) {
  const [price, setPrice] = useState<number | "">(suggested ?? round2(o.currentPrice.price * 1.1));
  const [undoing, setUndoing] = useState(false);
  const active = prices.find((p) => p.active);
  return (
    <Section title={`${o.description}: price for new checkouts`} aside={`Today ${gbp(o.currentPrice.price)} · ${o.currentPrice.source === "rollout" ? "set in saka" : "from sales history"}`}>
      <div className="grid grid-cols-1 gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Field label="New price per unit" className="max-w-[220px]"><MoneyInput value={price} onChange={setPrice} ariaLabel="New price" /></Field>
          <ApproveAction
            key={String(price)}
            disabled={typeof price !== "number" || price <= 0 || Math.abs(price - o.currentPrice.price) < 0.005}
            summary={typeof price === "number" ? <>Every new storefront checkout for this product is charged <b className="text-ink">{gbp(price)}</b> instead of {gbp(o.currentPrice.price)}. Running price tests for it end. You can undo this below.</> : "Enter a price."}
            label={typeof price === "number" ? `Approve ${gbp(price)}` : "Approve"}
            request={() => ({ path: "/api/apply/rollout", body: { code: o.code, price } })}
            onDone={onChange}
            renderResult={() => <>Done. New checkouts are charged {typeof price === "number" ? gbp(price) : ""}.</>}
          />
        </div>
        <div>
          <h3 className="text-[14px] font-semibold">Price history in saka</h3>
          {prices.length === 0 ? <p className="mt-2 text-[14px] text-ink-2">No changes yet. The storefront charges the last price from the sales history.</p> : (
            <ul className="mt-2 divide-y divide-rule border-y border-rule text-[13px]">
              {prices.map((p) => (
                <li key={p.id} className={`flex items-center justify-between gap-4 py-2 ${p.active ? "" : "text-ink-3"}`}>
                  <span className={`num ${p.active ? "font-semibold" : "line-through decoration-1"}`}>{gbp(p.price)}</span>
                  <span className="flex-1 text-ink-3">{dateShort(p.set_at)} · {p.set_by}</span>
                  {p.active ? <Status tone="done">Live</Status> : <span className="text-[12px]">Replaced</span>}
                </li>
              ))}
            </ul>
          )}
          {active && (
            <div className="mt-3">
              <Button tone="secondary" size="sm" busy={undoing} onClick={async () => { setUndoing(true); try { await api("/api/apply/rollback", { body: { code: o.code } }); onChange(); } finally { setUndoing(false); } }}>
                Undo: go back to the previous price
              </Button>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function Club({ club, proposal, onChange }: { club: ClubState; proposal: Handed | null; onChange: () => void }) {
  const plan = club.plan;
  const regular = plan?.regularPrice ?? 18;
  const [newPrice, setNewPrice] = useState<number | "">(proposal?.kind === "update_plan_price" || proposal?.kind === "consent_switch" ? (proposal.newPrice ?? 20) : round2(regular * 1.1));
  const [intro, setIntro] = useState<{ price: number | ""; months: number | ""; then: number | "" }>({
    price: proposal?.kind === "intro_offer" ? (proposal.introPrice ?? round2(regular * 0.67)) : round2(regular * 0.67),
    months: proposal?.kind === "intro_offer" ? (proposal.introMonths ?? 2) : 2,
    then: proposal?.kind === "intro_offer" ? (proposal.newPrice ?? regular) : regular,
  });
  const [sub, setSub] = useState(club.subscribers[0]?.id ?? "");
  const [toPlan, setToPlan] = useState(club.plans[0]?.id ?? "");
  const [planWide, setPlanWide] = useState<number | "">(round2(regular * 1.1));

  if (!plan) {
    return (
      <Section className="mt-12" title="Gift Box Club: PayPal subscription">
        <div className="max-w-[640px]">
          <ApproveAction
            summary={<>Creates a <b className="text-ink">Gift Box Club</b> product and a monthly plan at <b className="text-ink">£18</b> in your PayPal sandbox. Buyers subscribe on the club page; then the subscription levers below apply.</>}
            label="Approve: set up the club on PayPal"
            request={() => ({ path: "/api/apply/club", body: { action: "setup" } })}
            onDone={onChange}
          />
        </div>
      </Section>
    );
  }
  const planName = (id: string) => club.plans.find((p) => p.id === id);
  return (
    <Section className="mt-12" title="Gift Box Club: PayPal subscription" aside={<span className="num">Plan {plan.id} · {plan.introPrice != null ? `${gbp(plan.introPrice)} intro, then ` : ""}{gbp(plan.regularPrice ?? 0)} a month · {plan.status.toLowerCase()}</span>}>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <LinkButton href="/store/club" external size="sm">Open the club page</LinkButton>
        <span className="text-[13px] text-ink-3">{club.subscribers.length} {club.subscribers.length === 1 ? "subscriber" : "subscribers"} recorded</span>
      </div>
      <div className="grid grid-cols-1 border-t border-rule lg:grid-cols-2">
        <Lever title="New price for new subscribers" note="Existing subscribers keep their plan. PayPal creates a new plan and the club page switches to it.">
          <Field label="Monthly price" className="max-w-[200px]"><MoneyInput value={newPrice} onChange={setNewPrice} ariaLabel="Monthly price" /></Field>
          <ApproveAction key={`np${newPrice}`} disabled={typeof newPrice !== "number" || newPrice <= 0}
            summary={<>Creates a PayPal plan at <b className="text-ink">{typeof newPrice === "number" ? gbp(newPrice) : "–"}</b> a month for new subscribers.</>}
            label="Approve new plan" request={() => ({ path: "/api/apply/club", body: { action: "new_price", price: newPrice } })} onSettled={onChange}
            renderResult={(r: { id: string }) => <>Plan {r.id} created. New subscribers join it.</>} />
        </Lever>
        <Lever title="Intro offer" note="A priced trial cycle on a new PayPal plan: a lower price for the first months, then the regular price.">
          <div className="flex flex-wrap gap-3">
            <Field label="Intro price" className="w-[130px]"><MoneyInput value={intro.price} onChange={(v) => setIntro({ ...intro, price: v })} ariaLabel="Intro price" /></Field>
            <Field label="Months" className="w-[90px]"><input type="number" min={1} max={12} className={inputCls} value={intro.months} onChange={(e) => setIntro({ ...intro, months: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
            <Field label="Then" className="w-[130px]"><MoneyInput value={intro.then} onChange={(v) => setIntro({ ...intro, then: v })} ariaLabel="Regular price" /></Field>
          </div>
          <ApproveAction key={`in${intro.price}${intro.months}${intro.then}`} disabled={[intro.price, intro.months, intro.then].some((x) => typeof x !== "number")}
            summary={<>Creates a PayPal plan: <b className="text-ink">{typeof intro.price === "number" ? gbp(intro.price) : "–"}</b> for {intro.months || "–"} months, then {typeof intro.then === "number" ? gbp(intro.then) : "–"} a month. New subscribers join it.</>}
            label="Approve intro offer" request={() => ({ path: "/api/apply/club", body: { action: "intro", introPrice: intro.price, introMonths: intro.months, price: intro.then } })} onSettled={onChange}
            renderResult={(r: { id: string }) => <>Plan {r.id} created with the intro offer.</>} />
        </Lever>
        <Lever title="Ask existing subscribers to switch" note="PayPal never moves a subscriber to a new price silently: it returns a link the subscriber must approve.">
          {club.subscribers.length === 0 ? (
            <p className="text-[14px] text-ink-2">No subscribers yet. Subscribe with a sandbox buyer account on the club page, then come back.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <Field label="Subscriber" className="min-w-[220px] flex-1">
                  <select className={inputCls} value={sub} onChange={(e) => setSub(e.target.value)}>
                    {club.subscribers.map((s) => <option key={s.id} value={s.id}>{s.email ?? s.id} · {s.status.toLowerCase()}</option>)}
                  </select>
                </Field>
                <Field label="Move to plan" className="min-w-[220px] flex-1">
                  <select className={inputCls} value={toPlan} onChange={(e) => setToPlan(e.target.value)}>
                    {club.plans.map((p) => <option key={p.id} value={p.id}>{p.kind === "intro" ? `${gbp(p.introPrice!)} for ${p.introMonths} mo, then ${gbp(p.price)}` : `${gbp(p.price)} a month`} · {p.id}</option>)}
                  </select>
                </Field>
              </div>
              <ApproveAction key={`cs${sub}${toPlan}`} disabled={!sub || !toPlan}
                summary={<>Asks PayPal to move <b className="text-ink">{club.subscribers.find((s) => s.id === sub)?.email ?? sub}</b> to {planName(toPlan) ? `the ${gbp(planName(toPlan)!.price)} plan` : "the chosen plan"}. Nothing changes until they approve the link.</>}
                label="Approve: request consent" request={() => ({ path: "/api/apply/club", body: { action: "consent_switch", subscriptionId: sub, planId: toPlan } })} onSettled={onChange}
                renderResult={(r: { approveUrl: string | null }) => r.approveUrl ? <>Send this link to the subscriber: <a className="break-all underline" href={r.approveUrl} target="_blank" rel="noreferrer">{r.approveUrl}</a></> : <>PayPal accepted the change without a link.</>} />
            </>
          )}
        </Lever>
        <Lever title="Change the price for everyone" note="Changes the current plan's price for every subscriber. The PayPal sandbox currently refuses this; use the two levers above instead.">
          <Field label="Monthly price" className="max-w-[200px]"><MoneyInput value={planWide} onChange={setPlanWide} ariaLabel="Plan-wide price" /></Field>
          <ApproveAction key={`pw${planWide}`} disabled={typeof planWide !== "number" || planWide <= 0}
            summary={<>Asks PayPal to change plan {plan.id} to <b className="text-ink">{typeof planWide === "number" ? gbp(planWide) : "–"}</b> a month for everyone.</>}
            label="Approve for everyone" request={() => ({ path: "/api/apply/club", body: { action: "plan_update", price: planWide } })} onSettled={onChange}
            renderResult={() => <>PayPal changed the plan price.</>} />
        </Lever>
      </div>
      <div className="mt-6"><Note>New plans don&apos;t touch existing subscribers. The consent link is the only way an existing subscriber&apos;s price changes.</Note></div>
    </Section>
  );
}

function Lever({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-rule py-6 lg:px-6 lg:odd:border-r lg:odd:pl-0 lg:even:pr-0">
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{note}</p>
      </div>
      {children}
    </div>
  );
}
