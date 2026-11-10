"use client";
import Link from "next/link";
import { useProduct } from "@/components/product-context";
import { useApi } from "@/lib/client/api";
import { PageHeader, Section, LinkButton, Loading, ErrorNote, Note } from "@/components/ui";
import { RangeBar, StepChart, domainFor } from "@/components/charts";
import { GroupsGrid } from "@/components/groups-grid";
import { gbp, gbp0, int, pctPlain, dateShort, elast } from "@/lib/client/format";
import type { Overview, PayPalSummary } from "@/lib/client/types";

const EVIDENCE: Record<string, string> = {
  none: "Never changed price in this history, so the range comes from typical gift-shop products.",
  weak: "Weak evidence: the past price changes are too few or too noisy to narrow this much.",
  some: "Some evidence from past price changes.",
  strong: "Strong evidence from past price changes.",
};

export default function OverviewPage() {
  const { code } = useProduct();
  const o = useApi<Overview>(code ? `/api/products/${code}` : null);
  const pp = useApi<PayPalSummary>("/api/paypal/summary");

  if (o.error) return <ErrorNote onRetry={o.reload}>{o.error}</ErrorNote>;
  if (!o.data) return <Loading label="Reading two years of sales" />;
  const d = o.data;
  const e = d.elasticity;
  const at10 = d.at10;

  return (
    <>
      <PageHeader
        title={d.description}
        lede={<>Charging <b className="text-ink num">{gbp(d.currentPrice.price)}</b> since {dateShort(d.currentPrice.since)}. Typical order {d.unitsPerOrder} units. Last 12 weeks of real sales to {dateShort(d.asOf)}.</>}
        actions={<>
          {d.runningTest && <LinkButton href="/app/test" tone="secondary">See the running test</LinkButton>}
          <LinkButton href="/app/what-if" tone="primary">Try a new price</LinkButton>
        </>}
      />

      <div className="grid grid-cols-1 border-y border-rule md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Units a week" value={int(d.kpis.weeklyUnits)} note={`${int(d.kpis.weeklyOrders)} orders a week`} />
        <Stat label="Customers buying it" value={int(d.kpis.customers)} note="in the last 12 weeks" />
        <Stat label="Profit a month after PayPal fees" value={gbp0(d.kpis.monthlyProfit)} note={`assumes a unit cost of ${gbp(d.unitCost)}; change it in What-if`} />
        <div className={KPI_CELL}>
          <p className="text-[13px] text-ink-2">How much buyers react to price</p>
          <p className="mt-1 text-[13px] text-ink-3">Units change for a 1% price rise</p>
          <RangeBar low={e.p10} mid={e.mean} high={e.p90} domain={[-3.5, 0.5]} format={elast} marks={[{ at: 0, label: "no reaction" }]} label="Price sensitivity" />
          <p className="text-[12px] leading-snug text-ink-3">{EVIDENCE[e.evidence]}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 items-center gap-x-10 gap-y-4 border-b border-rule pb-6 lg:grid-cols-[1fr_2fr]">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">If you charged {gbp(at10.newPrice)} (+10%)</h2>
          <p className="mt-1 text-[14px] text-ink-2">Monthly profit after PayPal fees. <span className="font-semibold text-ink">{pctPlain(at10.probProfitUp)}</span> chance it beats today.</p>
          <Link href="/app/what-if" className="mt-2 inline-block text-[13px] underline decoration-rule-2 hover:decoration-ink">Try other prices</Link>
        </div>
        <RangeBar low={at10.profit.p10} mid={at10.profit.p50} high={at10.profit.p90} base={at10.profit.base} domain={domainFor([at10.profit.p10, at10.profit.p90, at10.profit.base])} format={gbp0} label="Monthly profit at +10%" />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Section title="Weekly units and list price" aside="Thin line: units. Thick line: list price.">
          <StepChart series={d.series} />
        </Section>
        <Section title="PayPal sandbox, last 30 days" aside={pp.data ? `${pp.data.transactions.length} ${pp.data.transactions.length === 1 ? "transaction" : "transactions"}` : undefined}>
          {pp.error ? <ErrorNote onRetry={pp.reload}>{pp.error}</ErrorNote> : !pp.data ? <Loading label="Asking PayPal" /> : pp.data.transactions.length === 0 ? (
            <p className="text-[14px] text-ink-2">No sandbox payments yet. Start a price test and buy from the storefront to see them here.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[340px] text-[13px]">
              <thead><tr className="border-b border-ink text-left"><th className="py-2 font-semibold">Date</th><th className="font-semibold">Status</th><th className="text-right font-semibold">Amount</th><th className="text-right font-semibold">Fee</th></tr></thead>
              <tbody>
                {pp.data.transactions.slice(0, 8).map((t) => (
                  <tr key={t.id} className="border-b border-rule">
                    <td className="py-2 num">{new Date(t.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                    <td className="text-ink-2">{t.status === "S" ? "Completed" : t.status === "P" ? "Pending" : t.status}</td>
                    <td className="text-right num">{t.currency === "GBP" ? gbp(t.amount) : `${t.amount.toFixed(2)} ${t.currency}`}</td>
                    <td className="text-right text-ink-3 num">{t.fee == null ? "–" : t.fee.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          <p className="mt-3 text-[12px] text-ink-3">Read live from PayPal transaction search.</p>
        </Section>
      </div>

      <Section className="mt-10" title="Customer groups" aside="Built from every customer's buying pattern across the whole shop">
        <GroupsGrid rows={d.groups} newPrice={gbp(at10.newPrice)} />
        <div className="mt-4"><Note>Each group reacts to price differently: regulars least, bulk buyers most. saka combines that with this product&apos;s own price sensitivity to estimate who keeps buying.</Note></div>
      </Section>
    </>
  );
}

const KPI_CELL = "border-rule py-5 max-md:border-t max-md:first:border-t-0 md:px-5 md:odd:pl-0 md:even:border-l md:[&:nth-child(n+3)]:border-t xl:[&:nth-child(3)]:border-l xl:[&:nth-child(3)]:pl-5 xl:[&:nth-child(n+3)]:border-t-0";

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={KPI_CELL}>
      <p className="text-[13px] text-ink-2">{label}</p>
      <p className="mt-2 text-[40px] font-bold leading-none tracking-[-0.03em] num">{value}</p>
      <p className="mt-2 text-[12px] text-ink-3">{note}</p>
    </div>
  );
}
