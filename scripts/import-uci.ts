/**
 * Import the UCI "Online Retail II" dataset (CC BY 4.0) into a compact, committed CSV.
 *
 * Source: Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository.
 * https://doi.org/10.24432/C5CG6D
 *
 * Usage: pnpm tsx scripts/import-uci.ts /path/to/online_retail_II.xlsx [topN]
 *
 * Keeps real purchase lines (no cancellations, no fees, known customer, positive price/qty)
 * for the topN best-selling products, and writes data/uci/lines.csv.gz.
 */
import ExcelJS from "exceljs";
import { createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import path from "node:path";

const NON_PRODUCT = new Set(["POST", "D", "DOT", "M", "C2", "BANK CHARGES", "AMAZONFEE", "S", "B", "CRUK", "PADS", "ADJUST", "ADJUST2", "TEST001", "TEST002"]);

type Line = { invoice: string; code: string; desc: string; qty: number; date: Date; price: number; customer: string; country: string };

function asDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400 * 1000)); // Excel serial
  if (typeof v === "string") { const d = new Date(v); return isNaN(+d) ? null : d; }
  return null;
}

async function main() {
  const file = process.argv[2];
  const topN = Number(process.argv[3] ?? 60);
  if (!file) throw new Error("usage: tsx scripts/import-uci.ts <online_retail_II.xlsx> [topN]");

  const lines: Line[] = [];
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, { sharedStrings: "cache", worksheets: "emit" });
  for await (const sheet of reader) {
    for await (const row of sheet) {
      if (row.number === 1) continue;
      const v = row.values as unknown[]; // 1-based
      const invoice = String(v[1] ?? "");
      const code = String(v[2] ?? "").trim().toUpperCase();
      const qty = Number(v[4]);
      const date = asDate(v[5]);
      const price = Number(v[6]);
      const customer = v[7] == null || v[7] === "" ? "" : String(Math.trunc(Number(v[7])));
      if (!invoice || invoice.startsWith("C") || !code || NON_PRODUCT.has(code)) continue;
      if (!(qty > 0) || !(price > 0) || !customer || !date) continue;
      lines.push({ invoice, code, desc: String(v[3] ?? "").trim(), qty, date, price, customer, country: String(v[8] ?? "").trim() });
    }
  }

  // Rank products by number of purchase lines.
  const byCode = new Map<string, Line[]>();
  for (const l of lines) (byCode.get(l.code) ?? byCode.set(l.code, []).get(l.code)!).push(l);
  const top = [...byCode.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, topN);

  const out = path.join(process.cwd(), "data/uci/lines.csv.gz");
  const gz = createGzip({ level: 9 });
  const ws = createWriteStream(out);
  gz.pipe(ws);
  gz.write("invoice,stock_code,description,quantity,invoice_date,unit_price,customer_id,country\n");
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  let kept = 0;
  for (const [, ls] of top) for (const l of ls) {
    gz.write([l.invoice, l.code, esc(l.desc), l.qty, l.date.toISOString(), l.price, l.customer, esc(l.country)].join(",") + "\n");
    kept++;
  }
  gz.end();
  await new Promise<void>((r) => ws.on("finish", () => r()));

  console.log(`clean purchase lines: ${lines.length}, products: ${byCode.size}, kept top ${top.length} products = ${kept} lines -> ${out}`);
  // Quick evidence of real price variation for the top 8 products: modal price by quarter.
  for (const [code, ls] of top.slice(0, 8)) {
    const q = new Map<string, Map<number, number>>();
    for (const l of ls) {
      const key = `${l.date.getUTCFullYear()}Q${Math.floor(l.date.getUTCMonth() / 3) + 1}`;
      const m = q.get(key) ?? q.set(key, new Map()).get(key)!;
      m.set(l.price, (m.get(l.price) ?? 0) + l.qty);
    }
    const modal = [...q.entries()].sort().map(([k, m]) => `${k}:${[...m.entries()].sort((a, b) => b[1] - a[1])[0][0]}`);
    console.log(`${code} ${ls[0].desc.slice(0, 34).padEnd(34)} lines=${ls.length} modal price by quarter: ${modal.join(" ")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
