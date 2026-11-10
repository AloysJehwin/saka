"use client";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { ShopFrame } from "@/components/shop-frame";
import { loadPayPal, type PayPalNamespace } from "@/components/paypal-sdk";
import { api, useApi } from "@/lib/client/api";
import { Loading, ErrorNote } from "@/components/ui";
import { gbp } from "@/lib/client/format";

type Club = { name: string; plan: { id: string; regularPrice: number | null; introPrice: number | null; introMonths: number | null; status: string } | null };

export default function ClubPage() {
  const club = useApi<Club>("/api/store/club");
  return (
    <ShopFrame>
      {club.error ? <ErrorNote onRetry={club.reload}>{club.error}</ErrorNote> : !club.data ? <Loading /> : !club.data.plan ? (
        <div className="max-w-[560px]">
          <h1 className="text-[36px] font-bold tracking-[-0.03em]">The Gift Box Club opens soon</h1>
          <p className="mt-3 text-[16px] text-ink-2">The shop hasn&apos;t set up the club on PayPal yet. In saka, open Apply and approve &ldquo;set up the club on PayPal&rdquo;.</p>
        </div>
      ) : <Subscribe name={club.data.name} plan={club.data.plan} />}
    </ShopFrame>
  );
}

function Subscribe({ name, plan }: { name: string; plan: NonNullable<Club["plan"]> }) {
  const holder = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let buttons: ReturnType<PayPalNamespace["Buttons"]> | null = null;
    loadPayPal({ vault: "true", intent: "subscription" }).then((paypal) => {
      if (cancelled || !holder.current) return;
      holder.current.innerHTML = "";
      buttons = paypal.Buttons({
        style: { layout: "vertical", shape: "rect", color: "black", label: "subscribe", height: 48, borderRadius: 0 },
        createSubscription: (_d: unknown, actions: { subscription: { create: (o: { plan_id: string }) => Promise<string> } }) => actions.subscription.create({ plan_id: plan.id }),
        onApprove: async (data: { subscriptionID: string }) => {
          try { await api("/api/store/club/subscribed", { body: { subscriptionId: data.subscriptionID } }); setDone(data.subscriptionID); }
          catch (e) { setError((e as Error).message); }
        },
        onError: () => setError("PayPal couldn't start the subscription. Nothing was charged."),
      });
      buttons.render(holder.current).catch(() => {});
    }).catch((e) => setError(e.message));
    return () => { cancelled = true; buttons?.close?.().catch(() => {}); };
  }, [plan.id]);

  if (done) {
    return (
      <div className="max-w-[560px]">
        <Check className="size-8 text-green" strokeWidth={2} aria-hidden />
        <h1 className="mt-4 text-[36px] font-bold tracking-[-0.03em]">Welcome to the club</h1>
        <p className="mt-3 text-[16px] text-ink-2">Your first box ships this month. Manage or cancel any time in your PayPal account.</p>
        <p className="mt-2 font-mono text-[12px] text-ink-3">PayPal subscription {done}</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-x-14 gap-y-10 md:grid-cols-[1.1fr_1fr]">
      <div>
        <h1 className="text-balance text-[44px] font-bold leading-[1.02] tracking-[-0.035em] md:text-[56px]">{name}</h1>
        <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-ink-2">A box of five seasonal gifts from the shop, every month: bags, tins, candles and paper goods. Skip or cancel whenever you like.</p>
      </div>
      <div className="flex flex-col gap-6 border-t border-ink pt-6">
        {plan.introPrice != null && (
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] text-ink-2">{plan.introMonths === 1 ? "First month" : plan.introMonths ? `First ${plan.introMonths} months, each` : "First months"}</span>
            <span className="text-[28px] font-bold leading-none num">{gbp(plan.introPrice)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] text-ink-2">{plan.introPrice != null ? "Then each month" : "Each month"}</span>
          <span className="text-[40px] font-bold leading-none tracking-[-0.03em] num">{gbp(plan.regularPrice ?? 0)}</span>
        </div>
        <div ref={holder} className="min-h-[52px]" />
        {error && <ErrorNote>{error}</ErrorNote>}
        <p className="text-[12px] text-ink-3">Billed by PayPal. You approve the subscription in PayPal&apos;s own window.</p>
      </div>
    </div>
  );
}
