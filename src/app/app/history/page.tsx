"use client";
import { useProduct } from "@/components/product-context";
import { useApi } from "@/lib/client/api";
import { PageHeader, Section, LinkButton, Loading, ErrorNote, Note } from "@/components/ui";
import { gbp, pct, dateShort } from "@/lib/client/format";
import type { HistoryView } from "@/lib/client/types";

type Ev = { weekStart: string; from: number; to: number; pctChange: number; windows: { weeks: number; effect: number | null }[]; predicted: { p10: number; p90: number } | null; withinRange: boolean | null; family?: { code: string }[]; description?: string };

export default function HistoryPage() {
  const { code, product } = useProduct();
  const h = useApi<HistoryView>(code ? `/api/products/${code}/history` : null);
  if (h.error) return <ErrorNote onRetry={h.reload}>{h.error}</ErrorNote>;
  if (!h.data) return <Loading label="Measuring past price changes against products that didn't change" />;
  const { events, shop } = h.data;

  return (
    <>
      <PageHeader
        title="What history can prove"
        lede={<>Across the shop&apos;s top 60 products there were <b className="text-ink">{shop.events} lasting price changes</b> in two years. A forecast built only on earlier weeks caught the real effect <b className="text-ink">{shop.withinRange} times</b>. Measured effects range from <b className="text-ink">{pct(shop.effectMin)}</b> to <b className="text-ink">{pct(shop.effectMax)}</b>, and for <b className="text-ink">{shop.signFlips}</b> changes the sign flips depending on how many weeks you compare.</>}
        actions={<LinkButton href="/app/test" tone="primary">Test on real checkouts instead</LinkButton>}
      />

      <Section title={`${product?.description ?? code}: past price changes`} aside="Each change compared with products whose price stayed put (difference in differences)">
        {events.length === 0 ? (
          <div className="border border-dashed border-rule-2 p-6">
            <p className="text-[15px] font-semibold">This product kept one price for the whole history.</p>
            <p className="mt-2 max-w-[65ch] text-[14px] leading-relaxed text-ink-2">So its sales say nothing about how buyers react to a price change. saka falls back to how typical gift-shop products react, which is why its range is wide. Pick the Jumbo Bag Red White Spotty to see a product that did change price.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            <Legend />
            {events.map((ev) => <EventRow key={ev.weekStart} ev={ev} />)}
          </div>
        )}
      </Section>

      <Section className="mt-12" title="Every lasting price change in the shop" aside="Each product measured against products whose price stayed put">
        <Legend />
        {shop.list.map((ev) => <EventRow key={`${ev.code}-${ev.weekStart}`} ev={ev} compact />)}
      </Section>

      <div className="mt-10 max-w-[75ch]"><Note>History mixes price changes with seasons, stock-outs and shop-wide swings, so the same change can look like a loss or a gain depending on the window. saka still uses history as its starting point, and admits how wide it is. Real PayPal checkouts at two prices settle the question.</Note></div>
    </>
  );
}

function Legend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-ink-3">
      <span className="flex items-center gap-2"><span className="inline-block h-[7px] w-6 bg-ink" />Forecast range from earlier weeks</span>
      <span className="flex items-center gap-2"><span className="inline-block size-2.5 rounded-full border-2 border-ink bg-sheet" />Measured over 4, 8, 12 and 16 weeks</span>
      <span className="flex items-center gap-2"><span className="inline-block h-3 w-px border-l border-dashed border-ink-3" />No effect</span>
    </div>
  );
}

function EventRow({ ev, compact }: { ev: Ev; compact?: boolean }) {
  const measured = ev.windows.filter((w) => w.effect != null) as { weeks: number; effect: number }[];
  const flips = measured.some((w) => w.effect > 0) && measured.some((w) => w.effect < 0);
  const vals = [0, ...measured.map((m) => m.effect), ...(ev.predicted ? [ev.predicted.p10, ev.predicted.p90] : [])];
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo || 0.2) * 0.12;
  const d0 = lo - pad, d1 = hi + pad;
  const at = (v: number) => Math.max(0, Math.min(100, ((v - d0) / (d1 - d0)) * 100));
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-3 border-t border-rule py-4 lg:grid-cols-[260px_1fr_220px]">
      <div>
        {compact && <p className="text-[13px] font-semibold">{ev.description}</p>}
        <p className={`${compact ? "text-[13px]" : "text-[15px] font-semibold"} num`}>{gbp(ev.from)} → {gbp(ev.to)} <span className="font-normal text-ink-3">({pct(ev.pctChange, 1)})</span></p>
        <p className="text-[13px] text-ink-2">Week of {dateShort(ev.weekStart)}</p>
        {!compact && ev.family && ev.family.length > 1 && <p className="mt-1 text-[12px] text-ink-3">Changed with {ev.family.length - 1} other products the same week</p>}
      </div>
      <div className="relative h-[64px]" role="img" aria-label={`Measured effects ${measured.map((m) => `${m.weeks} weeks ${pct(m.effect)}`).join(", ")}`}>
        <div className="absolute inset-x-0 top-[30px] h-px bg-rule-2" />
        <div className="absolute top-[16px] h-[29px] w-px border-l border-dashed border-ink-3" style={{ left: `${at(0)}%` }} />
        {ev.predicted && <div className="absolute top-[27px] h-[7px] bg-ink" style={{ left: `${at(ev.predicted.p10)}%`, width: `${Math.max(0.8, at(ev.predicted.p90) - at(ev.predicted.p10))}%` }} />}
        {measured.map((m, i) => (
          <div key={m.weeks} className="absolute top-[24px] -translate-x-1/2" style={{ left: `${at(m.effect)}%` }}>
            <span className={`block size-[13px] rounded-full border-2 bg-sheet ${m.effect < 0 ? "border-red" : "border-ink"}`} />
            <span className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-ink-3 num ${i % 2 ? "-top-[17px]" : "top-[15px]"}`}>{m.weeks}w</span>
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-[11px] text-ink-3 num"><span>{pct(d0)}</span><span>{pct(d1)}</span></div>
      </div>
      <div className="text-[13px] leading-snug">
        {flips ? <p className="font-semibold text-red-ink">Gain or loss depends on the window</p> : <p className="font-semibold">Same direction in every window</p>}
        <p className="mt-1 text-ink-2 num">{measured.map((m) => `${m.weeks}w ${pct(m.effect)}`).join(" · ")}</p>
        {ev.withinRange != null && <p className="mt-1 text-ink-3">{ev.withinRange ? "Inside the forecast range" : "Outside the forecast range"}</p>}
      </div>
    </div>
  );
}
