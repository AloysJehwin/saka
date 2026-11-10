import { handle, HttpError, requireUser } from "@/lib/server/http";
import { overview } from "@/lib/server/shop";
import { runningFor } from "@/lib/server/experiments";

export async function GET(_req: Request, ctx: RouteContext<"/api/products/[code]">) {
  return handle(async () => {
    await requireUser();
    const { code } = await ctx.params;
    const o = overview(code);
    if (!o) throw new HttpError(404, "Unknown product.");
    return { ...o, runningTest: runningFor(code)?.id ?? null };
  });
}
