import { handle, HttpError, requireUser } from "@/lib/server/http";
import { historyFor, product } from "@/lib/server/shop";

export async function GET(_req: Request, ctx: RouteContext<"/api/products/[code]/history">) {
  return handle(async () => {
    await requireUser();
    const { code } = await ctx.params;
    if (!product(code)) throw new HttpError(404, "Unknown product.");
    return historyFor(code);
  });
}
