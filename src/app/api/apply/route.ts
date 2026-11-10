import { db } from "@/lib/db";
import { handle, requireUser } from "@/lib/server/http";
import { clubState } from "@/lib/server/club";

export async function GET() {
  return handle(async () => {
    await requireUser();
    const club = await clubState();
    const actions = db().prepare("select * from actions order by id desc limit 30").all();
    const prices = db().prepare("select * from prices order by id desc limit 20").all();
    return { club, actions, prices };
  });
}
