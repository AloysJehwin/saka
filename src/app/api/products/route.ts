import { handle, requireUser } from "@/lib/server/http";
import { catalog, currentPrice } from "@/lib/server/shop";

export async function GET() {
  return handle(async () => {
    await requireUser();
    return catalog().map((p) => ({ ...p, currentPrice: currentPrice(p.code).price }));
  });
}
