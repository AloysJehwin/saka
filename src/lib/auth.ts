import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";

const providers = {
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
    : {}),
  ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? { github: { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET } }
    : {}),
};

/** Local testing before OAuth apps exist: email sign-in, never available in production builds. */
export const devLoginEnabled = () => process.env.SAKA_DEV_LOGIN === "1" && process.env.NODE_ENV !== "production";

/** Sign-in with Google or GitHub. Anyone may sign in; everyone shares the one demo shop. */
export const auth = betterAuth({
  database: db(),
  socialProviders: providers,
  emailAndPassword: { enabled: devLoginEnabled() },
  session: { expiresIn: 60 * 60 * 24 * 14, cookieCache: { enabled: true, maxAge: 300 } },
  plugins: [nextCookies()],
});

export const enabledProviders = () => Object.keys(providers) as ("google" | "github")[];
