import { body, handle, HttpError, requireUser } from "@/lib/server/http";
import { db, logAction } from "@/lib/db";
import { currentPrice, product } from "@/lib/server/shop";

/** Undo the latest rollout for a product: the previous approved price (or the historical one) applies again. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { code } = await body<{ code: string }>(req);
    const p = product(code);
    if (!p) throw new HttpError(404, "Unknown product.");
    const latest = db().prepare("select id, price from prices where code = ? and active = 1 order by id desc limit 1").get(code) as { id: number; price: number } | undefined;
    if (!latest) throw new HttpError(409, "There is no rollout to undo.");
    db().prepare("update prices set active = 0 where id = ?").run(latest.id);
    const prev = db().prepare("select id from prices where code = ? and id < ? order by id desc limit 1").get(code, latest.id) as { id: number } | undefined;
    if (prev) db().prepare("update prices set active = 1 where id = ?").run(prev.id);
    logAction({ kind: "rollback", summary: `${p.item.description}: back to £${currentPrice(code).price.toFixed(2)}`, ok: true, userEmail: user.email });
    return { ok: true, price: currentPrice(code).price };
  });
}
