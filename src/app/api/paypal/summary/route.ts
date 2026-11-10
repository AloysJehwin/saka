import { handle, requireUser } from "@/lib/server/http";
import { listTransactions } from "@/lib/paypal/client";

export async function GET() {
  return handle(async () => {
    await requireUser();
    const end = new Date(), start = new Date(end.getTime() - 30 * 86400000);
    const tx = await listTransactions(start, end);
    return {
      from: start.toISOString(), to: end.toISOString(),
      transactions: tx.map((t) => ({
        id: t.transaction_info.transaction_id, date: t.transaction_info.transaction_initiation_date,
        amount: Number(t.transaction_info.transaction_amount.value), currency: t.transaction_info.transaction_amount.currency_code,
        fee: t.transaction_info.fee_amount ? Number(t.transaction_info.fee_amount.value) : null,
        status: t.transaction_info.transaction_status, code: t.transaction_info.transaction_event_code, country: t.payer_info?.country_code ?? null,
      })).sort((a, b) => b.date.localeCompare(a.date)),
    };
  });
}
