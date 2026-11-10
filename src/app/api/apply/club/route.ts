import { body, handle, HttpError, requireUser } from "@/lib/server/http";
import { createClubPlan, reviseSubscriber, setupClub, updateClubPlanPrice } from "@/lib/server/club";

type Req =
  | { action: "setup" }
  | { action: "new_price"; price: number }
  | { action: "intro"; price: number; introPrice: number; introMonths: number }
  | { action: "consent_switch"; subscriptionId: string; planId: string }
  | { action: "plan_update"; price: number };

/** Every PayPal billing write the seller approves on the Apply screen. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = await body<Req>(req);
    switch (b.action) {
      case "setup": return setupClub(user.email);
      case "new_price": return createClubPlan({ kind: "new_price", price: b.price, userEmail: user.email });
      case "intro": return createClubPlan({ kind: "intro", price: b.price, introPrice: b.introPrice, introMonths: b.introMonths, userEmail: user.email });
      case "consent_switch": return reviseSubscriber(b.subscriptionId, b.planId, user.email);
      case "plan_update": return updateClubPlanPrice(b.price, user.email);
      default: throw new HttpError(400, "Unknown action.");
    }
  });
}
