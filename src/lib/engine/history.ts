import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import type { PurchaseLine } from "./types";

/** Minimal CSV parser that handles quoted fields with commas and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

let cache: PurchaseLine[] | null = null;

/** Load the committed UCI Online Retail II subset (real history of a UK gift shop). */
export function loadUciLines(file = path.join(process.cwd(), "data/uci/lines.csv.gz")): PurchaseLine[] {
  if (cache) return cache;
  const rows = parseCsv(gunzipSync(readFileSync(file)).toString("utf8"));
  cache = rows.slice(1).filter((r) => r.length >= 8).map((r) => ({
    invoice: r[0], stockCode: r[1], description: r[2], quantity: Number(r[3]), date: new Date(r[4]),
    unitPrice: Number(r[5]), customerId: r[6], country: r[7],
  }));
  return cache;
}
