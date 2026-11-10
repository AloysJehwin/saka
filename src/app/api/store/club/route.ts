import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { CLUB, clubPlanId, describePlan } from "@/lib/server/club";
import { getPlan } from "@/lib/paypal/client";

export async function GET() {
  return handle(async () => {
    await connection();
    const id = clubPlanId();
    if (!id) return { plan: null, name: CLUB.name };
    return { plan: describePlan(await getPlan(id)), name: CLUB.name };
  });
}
