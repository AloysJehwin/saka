export const gbp = (n: number, digits = 2) =>
  `${n < 0 ? "−" : ""}£${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const gbp0 = (n: number) => gbp(n, 0);
export const int = (n: number) => Math.round(n).toLocaleString("en-GB");
export const pct = (n: number, digits = 0) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n * 100).toFixed(digits)}%`;
export const pctPlain = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;
export const dateShort = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const timeShort = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
/** Elasticity as "units change for a 1% price rise", with a true minus sign. */
export const elast = (v: number) => `${v < 0 ? "−" : v > 0 ? "+" : ""}${Math.abs(v).toFixed(1)}%`;
export const round2 = (n: number) => Math.round(n * 100) / 100;
