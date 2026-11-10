"use client";
import { useEffect, useRef, useState } from "react";

const clamp = (x: number) => Math.max(0, Math.min(100, x));

export type RangeBarProps = {
  low: number; mid: number; high: number;
  domain: [number, number];
  format: (n: number) => string;
  /** Today's value: a hollow tick. */
  base?: number;
  baseLabel?: string;
  /** Earlier ranges, oldest first: drawn as faint end marks so the narrowing stays visible. */
  ghosts?: { low: number; high: number }[];
  /** Reference lines such as zero. */
  marks?: { at: number; label: string }[];
  size?: "lg" | "sm";
  label?: string;
};

/**
 * The range bar: low case to high case as an ink bar on a hairline scale, the likely value as a red tick,
 * today as a hollow tick. Everything saka forecasts is drawn this way, because a price is a range, not a number.
 */
export function RangeBar({ low, mid, high, domain, format, base, baseLabel = "today", ghosts = [], marks = [], size = "lg", label }: RangeBarProps) {
  const [d0, d1] = domain;
  const at = (v: number) => clamp(((v - d0) / (d1 - d0)) * 100);
  const lo = at(Math.min(low, high)), hi = at(Math.max(low, high)), md = at(mid);
  const lg = size === "lg";
  const recent = ghosts.slice(-4);
  const gh = lg ? recent.length * 3 : 0; // extra height for the earlier-range lines under the bar
  const loLabel = Math.min(88, Math.max(6, lo)), hiLabel = Math.max(12, Math.min(94, hi));
  const aria = `${label ? label + ": " : ""}likely ${format(mid)}, range ${format(low)} to ${format(high)}${base !== undefined ? `, ${baseLabel} ${format(base)}` : ""}`;
  return (
    <div className="relative w-full" style={{ height: lg ? 70 + gh : 26 }} role="img" aria-label={aria}>
      {lg && (
        <span className="step absolute top-0 -translate-x-1/2 whitespace-nowrap text-[13px] font-semibold text-red-ink num" style={{ left: `${Math.min(92, Math.max(8, md))}%` }}>{format(mid)}</span>
      )}
      <div className={`absolute inset-x-0 ${lg ? "top-[30px]" : "top-[12px]"} h-px bg-rule-2`} />
      {marks.map((m) => (
        <div key={m.label} className={`absolute ${lg ? "top-[22px]" : "top-[5px] h-[16px]"} w-px border-l border-dashed border-ink-3`} style={{ left: `${at(m.at)}%`, height: lg ? 20 + gh : undefined }} />
      ))}
      {lg && recent.map((g, i) => (
        <div key={i} className="absolute h-px bg-ghost" style={{ top: 38 + (recent.length - 1 - i) * 3, left: `${at(Math.min(g.low, g.high))}%`, width: `${Math.max(0.4, at(Math.max(g.low, g.high)) - at(Math.min(g.low, g.high)))}%`, opacity: 0.35 + (0.65 * (i + 1)) / recent.length }} />
      ))}
      <div className={`step absolute ${lg ? "top-[26px] h-[9px]" : "top-[9px] h-[7px]"} bg-ink`} style={{ left: `${lo}%`, width: `${Math.max(0.6, hi - lo)}%` }} />
      {base !== undefined && (
        <div className={`absolute ${lg ? "top-[22px] h-[17px]" : "top-[6px] h-[13px]"} w-[7px] -translate-x-1/2 border-2 border-ink bg-sheet`} style={{ left: `${at(base)}%` }} title={`${baseLabel}: ${format(base)}`} />
      )}
      <div className={`step absolute ${lg ? "top-[20px] h-[21px]" : "top-[4px] h-[18px]"} w-[3px] -translate-x-1/2 bg-red`} style={{ left: `${md}%` }} />
      {lg && (
        <div className="absolute inset-x-0 text-[12px] text-ink-3 num" style={{ top: 48 + gh }}>
          <span className="step absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${loLabel}%` }}>{format(Math.min(low, high))}</span>
          <span className="step absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${hiLabel}%` }}>{format(Math.max(low, high))}</span>
          {marks.filter((m) => Math.abs(at(m.at) - loLabel) > 11 && Math.abs(at(m.at) - hiLabel) > 11).map((m) => (
            <span key={m.label} className="absolute -translate-x-1/2 whitespace-nowrap text-[11px]" style={{ left: `${Math.min(90, Math.max(8, at(m.at)))}%` }}>{m.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pick a display domain that holds the range, today's value and any marks, with a little air. */
export function domainFor(values: number[], pad = 0.12): [number, number] {
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || Math.abs(hi) || 1;
  return [lo - span * pad, hi + span * pad];
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export type WeekPoint = { weekStart: string; units: number; listPrice: number };

/**
 * Weekly units as a stepped area with the list price as a stepped line above it.
 * Lines only move at right angles: each week is a fact, not a curve.
 */
export function StepChart({ series, height = 260, currency = "£" }: { series: WeekPoint[]; height?: number; currency?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 44, padR = 52, padT = 18, padB = 26;
  const iw = Math.max(0, width - padL - padR), ih = height - padT - padB;
  const n = series.length;
  const maxU = Math.max(1, ...series.map((p) => p.units));
  const prices = series.map((p) => p.listPrice);
  const pLo = Math.min(...prices), pHi = Math.max(...prices);
  const pSpan = pHi - pLo || pHi * 0.1 || 1;
  const x = (i: number) => padL + (iw * i) / Math.max(1, n);
  const yU = (u: number) => padT + ih - (ih * u) / (maxU * 1.08);
  const yP = (p: number) => padT + ih * 0.12 + (ih * 0.28) * (1 - (p - (pLo - pSpan * 0.15)) / (pSpan * 1.3));

  let area = `M ${x(0)} ${yU(0)}`, line = "", price = "";
  series.forEach((p, i) => {
    area += ` L ${x(i)} ${yU(p.units)} L ${x(i + 1)} ${yU(p.units)}`;
    line += `${i ? " L" : "M"} ${x(i)} ${yU(p.units)} L ${x(i + 1)} ${yU(p.units)}`;
    price += `${i ? " L" : "M"} ${x(i)} ${yP(p.listPrice)} L ${x(i + 1)} ${yP(p.listPrice)}`;
  });
  area += ` L ${x(n)} ${yU(0)} Z`;
  const changes = series.map((p, i) => (i > 0 && p.listPrice !== series[i - 1].listPrice ? i : -1)).filter((i) => i > 0);
  // Stack annotations that would collide (a short dip and recovery a week apart) onto separate lines.
  const rowEnds: number[] = [];
  const labelRow = new Map<number, number>();
  for (const i of changes) {
    let r = rowEnds.findIndex((end) => x(i) > end + 8);
    if (r === -1) r = rowEnds.length;
    rowEnds[r] = x(i) + 4 + 112;
    labelRow.set(i, r);
  }
  const years = series.map((p, i) => (i === 0 || p.weekStart.slice(0, 4) !== series[i - 1].weekStart.slice(0, 4) ? i : -1)).filter((i) => i >= 0)
    .filter((i, k, arr) => k === arr.length - 1 || (iw * (arr[k + 1] - i)) / Math.max(1, n) > 44);
  const h = hover !== null ? series[hover] : null;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block" role="img" aria-label={`Weekly units and list price over ${n} weeks`}
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.floor(((e.clientX - r.left - padL) / iw) * n); setHover(i >= 0 && i < n ? i : null); }}
          onMouseLeave={() => setHover(null)}>
          {[0.5, 1].map((f) => (
            <g key={f}>
              <line x1={padL} x2={padL + iw} y1={yU(maxU * f)} y2={yU(maxU * f)} stroke="var(--rule)" />
              <text x={padL - 8} y={yU(maxU * f) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">{Math.round(maxU * f).toLocaleString("en-GB")}</text>
            </g>
          ))}
          <path d={area} fill="var(--wash)" />
          <path d={line} fill="none" stroke="var(--ink)" strokeWidth="1" />
          <path d={price} fill="none" stroke="var(--ink)" strokeWidth="2" />
          {changes.map((i) => (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1={padT} y2={padT + ih} stroke="var(--ink)" strokeDasharray="2 3" />
              <text x={x(i) + 4} y={padT + 2 + (labelRow.get(i) ?? 0) * 13} fontSize="11" fill="var(--ink)" fontWeight="600" stroke="var(--paper)" strokeWidth="3" paintOrder="stroke">
                {currency}{series[i - 1].listPrice.toFixed(2)} → {currency}{series[i].listPrice.toFixed(2)}
              </text>
            </g>
          ))}
          <line x1={padL} x2={padL + iw} y1={padT + ih} y2={padT + ih} stroke="var(--ink)" />
          {years.map((i) => (
            <text key={i} x={x(i)} y={height - 8} fontSize="11" fill="var(--ink-3)">{series[i].weekStart.slice(0, 4)}</text>
          ))}
          <text x={padL + iw + 8} y={yP(pHi) + 4} fontSize="11" fill="var(--ink)" fontWeight="600">{currency}{pHi.toFixed(2)}</text>
          {pLo !== pHi && <text x={padL + iw + 8} y={yP(pLo) + 4} fontSize="11" fill="var(--ink-3)">{currency}{pLo.toFixed(2)}</text>}
          {hover !== null && <rect x={x(hover)} y={padT} width={Math.max(1, iw / n)} height={ih} fill="var(--red)" opacity="0.18" />}
        </svg>
      )}
      {h && (
        <div className="pointer-events-none absolute right-[52px] top-0 bg-ink px-2 py-1 text-[12px] text-paper num">
          Week of {new Date(h.weekStart).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {h.units.toLocaleString("en-GB")} units · {currency}{h.listPrice.toFixed(2)}
        </div>
      )}
    </div>
  );
}

/** Group share as a dot from a fixed size ramp, so share reads at a glance across the table. */
export function ShareDot({ share }: { share: number }) {
  const ramp = [5, 8, 11, 14, 18];
  const size = ramp[Math.min(ramp.length - 1, Math.floor(share * 5))];
  return <span aria-hidden className="inline-block shrink-0 rounded-full bg-ink align-middle" style={{ width: size, height: size }} />;
}

/** Probability against the two stop-rule thresholds: below 5% the test stops, above 95% it is ready. */
export function ChanceLine({ p }: { p: number }) {
  return (
    <div className="relative h-[34px] w-full" role="img" aria-label={`Chance the new price wins: ${(p * 100).toFixed(0)}%`}>
      <div className="absolute inset-x-0 top-[14px] h-px bg-rule-2" />
      <div className="absolute top-[8px] h-[13px] w-px bg-red-ink" style={{ left: "5%" }} />
      <div className="absolute top-[8px] h-[13px] w-px bg-green" style={{ left: "95%" }} />
      <span className="absolute left-0 top-[22px] whitespace-nowrap text-[11px] text-red-ink">stop at 5%</span>
      <span className="absolute right-0 top-[22px] whitespace-nowrap text-[11px] text-green">roll out at 95%</span>
      <div className="step absolute top-[6px] h-[17px] w-[3px] -translate-x-1/2 bg-ink" style={{ left: `${clamp(p * 100)}%` }} />
    </div>
  );
}
