import { handle, requireUser } from "@/lib/server/http";
import { stopExperiment } from "@/lib/server/experiments";

export async function POST(_req: Request, ctx: RouteContext<"/api/experiments/[id]/stop">) {
  return handle(async () => {
    const user = await requireUser();
    stopExperiment((await ctx.params).id, user.email);
    return { ok: true };
  });
}
