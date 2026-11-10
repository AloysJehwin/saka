import { handle, requireUser } from "@/lib/server/http";
import { experimentView } from "@/lib/server/experiments";

export async function GET(_req: Request, ctx: RouteContext<"/api/experiments/[id]">) {
  return handle(async () => { await requireUser(); return experimentView((await ctx.params).id); });
}
