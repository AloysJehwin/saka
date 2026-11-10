import { body, handle, requireUser } from "@/lib/server/http";
import { createExperiment, listExperiments } from "@/lib/server/experiments";

export async function GET() {
  return handle(async () => { await requireUser(); return listExperiments(); });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = await body<{ code: string; testPrice: number; share: number; unitCost: number; unitsPerOrder: number }>(req);
    return { id: createExperiment({ ...b, userEmail: user.email }) };
  });
}
