import type { PurchaseLine, SegmentId } from "./types";

export type CustomerProfile = {
  customerId: string;
  country: string;
  orders: number;
  units: number;
  spend: number;
  firstDate: Date;
  lastDate: Date;
  medianQtyPerLine: number;
  segment: SegmentId;
};

export const SEGMENT_LABELS: Record<SegmentId, { name: string; description: string }> = {
  regulars: { name: "Regulars", description: "Buy often and bought recently" },
  bulk: { name: "Bulk buyers", description: "Buy large quantities per order, often resellers" },
  new: { name: "New customers", description: "First purchase in the last 90 days" },
  occasional: { name: "Occasional buyers", description: "Buy now and then" },
};

const DAY = 86400 * 1000;

/** Explainable, rule-based segments as of a given date. */
export function profileCustomers(lines: PurchaseLine[], asOf: Date): Map<string, CustomerProfile> {
  const acc = new Map<string, { country: string; invoices: Set<string>; units: number; spend: number; first: number; last: number; qtys: number[] }>();
  for (const l of lines) {
    if (l.date > asOf) continue;
    const t = l.date.getTime();
    const e = acc.get(l.customerId) ?? acc.set(l.customerId, { country: l.country, invoices: new Set(), units: 0, spend: 0, first: t, last: t, qtys: [] }).get(l.customerId)!;
    e.invoices.add(l.invoice);
    e.units += l.quantity;
    e.spend += l.quantity * l.unitPrice;
    e.first = Math.min(e.first, t);
    e.last = Math.max(e.last, t);
    e.qtys.push(l.quantity);
  }
  const out = new Map<string, CustomerProfile>();
  for (const [id, e] of acc) {
    const q = [...e.qtys].sort((a, b) => a - b);
    const medianQty = q[Math.floor(q.length / 2)];
    const orders = e.invoices.size;
    const recentDays = (asOf.getTime() - e.last) / DAY;
    const ageDays = (asOf.getTime() - e.first) / DAY;
    let segment: SegmentId = "occasional";
    if (medianQty >= 24) segment = "bulk";
    else if (orders >= 5 && recentDays <= 90) segment = "regulars";
    else if (ageDays <= 90) segment = "new";
    out.set(id, {
      customerId: id, country: e.country, orders, units: e.units, spend: e.spend,
      firstDate: new Date(e.first), lastDate: new Date(e.last), medianQtyPerLine: medianQty, segment,
    });
  }
  return out;
}
