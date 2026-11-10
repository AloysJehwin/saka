"use client";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { RangeBar } from "@/components/charts";
import { Button, Field, inputCls } from "@/components/ui";

const GITHUB = "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12";
const GOOGLE = "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z";

type Options = { providers: ("google" | "github")[]; devLogin: boolean };

export function SignIn() {
  const [opts, setOpts] = useState<Options | null>(null);
  const [next, setNext] = useState("/app");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("next");
    if (n && n.startsWith("/app")) setNext(n);
    fetch("/api/sign-in-options").then((r) => r.json()).then(setOpts).catch(() => setOpts({ providers: [], devLogin: false }));
  }, []);
  useEffect(() => { if (session) window.location.href = next; }, [session, next]);

  const social = async (provider: "google" | "github") => {
    setBusy(provider); setError(null);
    const r = await authClient.signIn.social({ provider, callbackURL: next, errorCallbackURL: "/sign-in" });
    if (r.error) { setError(r.error.message ?? "Sign-in failed."); setBusy(null); }
  };

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
      <section className="flex flex-col justify-between bg-rail px-6 py-8 text-rail-ink md:px-14 md:py-12">
        <p className="text-[22px] font-bold tracking-[-0.04em]">saka <span className="text-[13px] font-normal tracking-normal text-rail-ink-2">PriceTwin</span></p>
        <div className="my-12 max-w-[640px]">
          <h1 className="text-balance text-[40px] font-bold leading-[1.02] tracking-[-0.035em] md:text-[56px]">Test a new price on real PayPal checkouts before you risk your customers.</h1>
          <p className="mt-6 max-w-[56ch] text-[16px] leading-relaxed text-rail-ink-2">
            saka learns your customer groups from your sales, shows the honest range of what a price change could do to profit after PayPal fees,
            then tests it on a slice of real checkouts. The range shrinks with every purchase, and the test stops itself if the new price is losing.
          </p>
        </div>
        <Demo />
      </section>
      <section className="flex items-center justify-center bg-paper px-6 py-12">
        <div className="w-full max-w-[380px]">
          <h2 className="text-[28px] font-bold tracking-[-0.03em]">Sign in</h2>
          <p className="mt-2 text-[14px] text-ink-2">Use Google or GitHub. You&apos;ll open the shared demo shop; every PayPal action runs in the sandbox.</p>
          <div className="mt-8 flex flex-col gap-3">
            {opts?.providers.includes("google") && (
              <Button tone="secondary" busy={busy === "google"} onClick={() => social("google")} className="h-12 justify-start gap-3 px-4">
                <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden><path d={GOOGLE} fill="currentColor" /></svg>Continue with Google
              </Button>
            )}
            {opts?.providers.includes("github") && (
              <Button tone="secondary" busy={busy === "github"} onClick={() => social("github")} className="h-12 justify-start gap-3 px-4">
                <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden><path d={GITHUB} fill="currentColor" /></svg>Continue with GitHub
              </Button>
            )}
            {opts && opts.providers.length === 0 && !opts.devLogin && (
              <p role="alert" className="border border-red px-3 py-2 text-[13px] text-red-ink">Sign-in isn&apos;t configured yet. Add the Google or GitHub OAuth keys to the server environment.</p>
            )}
            {!opts && <p className="text-[13px] text-ink-3">Loading sign-in options…</p>}
          </div>
          {opts?.devLogin && <DevLogin next={next} />}
          {error && <p role="alert" className="mt-4 text-[13px] text-red-ink">{error}</p>}
        </div>
      </section>
    </div>
  );
}

/** A static picture of the mechanism: the range narrowing as checkouts arrive. */
function Demo() {
  const steps = [{ low: -0.31, high: 0.36 }, { low: -0.18, high: 0.27 }, { low: -0.06, high: 0.2 }];
  return (
    <div className="max-w-[560px] text-rail-ink [--rule-2:#3a3a37] [--ink:#f4f4f1] [--ink-3:#a8a8a2] [--sheet:#111] [--ghost:#6b6b67] [--red-ink:#ff5a6e]">
      <p className="mb-1 text-[13px] text-rail-ink-2">Profit per shopper, test price against today · illustration</p>
      <RangeBar low={0.02} mid={0.09} high={0.15} ghosts={steps} domain={[-0.4, 0.45]} marks={[{ at: 0, label: "no change" }]} format={(v) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}%`} label="Illustration of a narrowing test range" />
      <p className="text-[12px] text-rail-ink-2">Faint marks show the wider range earlier in the test.</p>
    </div>
  );
}

function DevLogin({ next }: { next: string }) {
  const [email, setEmail] = useState("seller@saka.test");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setError(null);
    const password = "local-only-password";
    const signIn = await authClient.signIn.email({ email, password });
    const err = signIn.error ? (await authClient.signUp.email({ email, password, name: email.split("@")[0] })).error : null;
    if (err) { setError(err.message ?? "Could not sign in."); setBusy(false); return; }
    window.location.href = next;
  };
  return (
    <div className="mt-10 border-t border-rule pt-6">
      <p className="text-[13px] font-semibold">Local testing</p>
      <p className="mt-1 text-[12px] text-ink-3">Shown only on a local server with SAKA_DEV_LOGIN=1. Never available in production.</p>
      <div className="mt-3 flex items-end gap-2">
        <Field label="Email" className="flex-1"><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Button tone="primary" busy={busy} onClick={go}>Sign in</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] text-red-ink">{error}</p>}
    </div>
  );
}
