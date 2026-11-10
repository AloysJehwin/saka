import { connection } from "next/server";
import { devLoginEnabled, enabledProviders } from "@/lib/auth";

export async function GET() {
  await connection();
  return Response.json({ providers: enabledProviders(), devLogin: devLoginEnabled() });
}
