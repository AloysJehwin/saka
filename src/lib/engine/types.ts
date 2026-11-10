export type PurchaseLine = {
  invoice: string;
  stockCode: string;
  description: string;
  quantity: number;
  date: Date;
  unitPrice: number;
  customerId: string;
  country: string;
};

export type WeekPoint = {
  weekStart: string; // ISO date (Monday, UTC)
  units: number;
  orders: number;
  listPrice: number; // modal unit price that week
};

export type SegmentId = "regulars" | "bulk" | "new" | "occasional";

export type PriceChange = {
  stockCode: string;
  weekStart: string; // first week at the new price
  from: number;
  to: number;
  pctChange: number;
};

export type Elasticity = {
  mean: number; // posterior mean
  sd: number; // posterior sd
  observed: { estimate: number; se: number } | null; // data-only OLS estimate, null if no price variation
  weeks: number;
  priceVariation: number; // sd of log list price
};
