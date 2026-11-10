import { body, handle, HttpError, requireUser } from "@/lib/server/http";
import { db, logAction, nowIso } from "@/lib/db";
import { currentPrice, product } from "@/lib/server/shop";
import { markRolledOut } from "@/lib/server/experiments";

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { code, price, note } = await body<{ code: string; price: number; note?: string }>(req);
    const p = product(code);
    if (!p) throw new HttpError(404, "Unknown product.");
    if (!(price > 0)) throw new HttpError(400, "Enter a price above zero.");
    const before = currentPrice(code).price;
    db().prepare("update prices set active = 0 where code = ?").run(code);
    db().prepare("insert into prices(code, price, set_by, set_at, note, active) values(?, ?, ?, ?, ?, 1)").run(code, price, user.email, nowIso(), note ?? null);
    markRolledOut(code);
    logAction({ kind: "rollout", summary: `${p.item.description}: £${before.toFixed(2)} to £${price.toFixed(2)} for all new checkouts`, ok: true, userEmail: user.email });
    return { ok: true };
  });
}
