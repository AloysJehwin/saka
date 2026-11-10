import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { PayPalError } from "@/lib/paypal/client";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new HttpError(401, "Sign in to continue.");
  return session.user;
}

/** Wrap a route handler: JSON in/out, readable errors (PayPal errors keep PayPal's own name and message). */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof PayPalError) {
      const issue = (e.details as { issue?: string; description?: string }[] | undefined)?.[0];
      return Response.json({ error: issue?.description ?? e.message, paypal: { name: e.name, issue: issue?.issue, debugId: e.debugId } }, { status: 502 });
    }
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: 500 });
  }
}

export async function body<T>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new HttpError(400, "Request body must be JSON."); }
}
