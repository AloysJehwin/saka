import { body, handle, requireUser } from "@/lib/server/http";
import { simulate, SCENARIOS, type Scenario } from "@/lib/server/experiments";

export async function POST(req: Request, ctx: RouteContext<"/api/experiments/[id]/simulate">) {
  return handle(async () => {
    await requireUser();
    const b = await body<{ visitors: number; scenario: Scenario }>(req);
    const scenario = b.scenario in SCENARIOS ? b.scenario : "history";
    simulate((await ctx.params).id, Math.round(b.visitors), scenario);
    return { ok: true };
  });
}
