/** Runs once when the server starts: create saka's tables and Better Auth's tables if missing. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { db } = await import("@/lib/db");
  db();
  const { auth } = await import("@/lib/auth");
  const { getMigrations } = await import("better-auth/db/migration");
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}
