"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Minus, Plus, Check } from "lucide-react";
import { ShopFrame } from "@/components/shop-frame";
import { loadPayPal, type PayPalNamespace } from "@/components/paypal-sdk";
import { api, useApi } from "@/lib/client/api";
import { Loading, ErrorNote } from "@/components/ui";
import { gbp } from "@/lib/client/format";

type Offer = { id: string; code: string; product: string; price: number; currency: string; defaultQty: number; running: boolean };
type Paid = { status: string; orderId: string; amount: { value: string; currency_code: string } | null };

export default function StorePage() {
  return <ShopFrame><Suspense fallback={<Loading />}><Store /></Suspense></ShopFrame>;
}

function Store() {
  const { id } = useParams<{ id: string }>();
  const offer = useApi<Offer>(`/api/store/${id}`);
  return offer.error ? <ErrorNote onRetry={offer.reload}>{offer.error}</ErrorNote> : !offer.data ? <Loading /> : <Product offer={offer.data} />;
}

function Product({ offer }: { offer: Offer }) {
  const [qty, setQty] = useState(offer.defaultQty);
  const [paid, setPaid] = useState<Paid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qtyRef = useRef(qty);
  qtyRef.current = qty;
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let buttons: ReturnType<PayPalNamespace["Buttons"]> | null = null;
    loadPayPal({ currency: "GBP", intent: "capture" }).then((paypal) => {
      if (cancelled || !holder.current) return;
      holder.current.innerHTML = "";
      buttons = paypal.Buttons({
        style: { layout: "vertical", shape: "rect", color: "black", label: "pay", height: 48, borderRadius: 0 },
        createOrder: async () => (await api<{ id: string }>(`/api/store/${offer.id}/order`, { body: { qty: qtyRef.current } })).id,
        onApprove: async (data: { orderID: string }) => {
          try { setPaid(await api<Paid>(`/api/store/${offer.id}/capture`, { body: { orderId: data.orderID } })); }
          catch (e) { setError((e as Error).message); }
        },
        onError: () => setError("PayPal couldn't complete the payment. Nothing was charged. Try again."),
      });
      if (buttons.isEligible()) buttons.render(holder.current).catch(() => {});
    }).catch((e) => setError(e.message));
    return () => { cancelled = true; buttons?.close?.().catch(() => {}); };
  }, [offer.id]);

  if (paid) {
    return (
      <div className="max-w-[560px]">
        <Check className="size-8 text-green" strokeWidth={2} aria-hidden />
        <h1 className="mt-4 text-[40px] font-bold leading-tight tracking-[-0.03em]">Thank you</h1>
        <p className="mt-3 text-[16px] text-ink-2">Paid <b className="text-ink num">{paid.amount ? gbp(Number(paid.amount.value)) : ""}</b> with PayPal for {qty} × {offer.product}.</p>
        <p className="mt-2 font-mono text-[12px] text-ink-3">PayPal order {paid.orderId} · {paid.status.toLowerCase()}</p>
      </div>
    );
  }

  const total = Math.round(offer.price * qty * 100) / 100;
  return (
    <div className="grid grid-cols-1 gap-x-14 gap-y-10 md:grid-cols-[1.1fr_1fr]">
      <div>
        <h1 className="text-balance text-[40px] font-bold leading-[1.02] tracking-[-0.035em] md:text-[56px]">{offer.product}</h1>
        <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-ink-2">
          From the Kettle &amp; Twine gift range. Sold by the unit; most customers buy {offer.defaultQty} at a time for their own shop or market stall.
        </p>
        <p className="mt-3 font-mono text-[12px] text-ink-3">Item {offer.code}</p>
      </div>
      <div className="flex flex-col gap-6 border-t border-ink pt-6">
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] text-ink-2">Price per unit</span>
          <span className="text-[40px] font-bold leading-none tracking-[-0.03em] num">{gbp(offer.price)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[14px] text-ink-2">Quantity</span>
          <div className="flex items-stretch border border-ink">
            <button aria-label="One fewer" className="grid size-11 place-items-center hover:bg-wash disabled:text-ink-3" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus className="size-4" /></button>
            <input aria-label="Quantity" type="number" min={1} max={500} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} className="w-16 border-x border-ink text-center text-[16px] font-semibold num focus:outline-none" />
            <button aria-label="One more" className="grid size-11 place-items-center hover:bg-wash disabled:text-ink-3" disabled={qty >= 500} onClick={() => setQty((q) => Math.min(500, q + 1))}><Plus className="size-4" /></button>
          </div>
        </div>
        <div className="flex items-baseline justify-between border-t border-rule pt-4">
          <span className="text-[16px] font-semibold">Total</span>
          <span className="text-[22px] font-bold num">{gbp(total)}</span>
        </div>
        <div ref={holder} className="min-h-[52px]" />
        {error && <ErrorNote>{error}</ErrorNote>}
        <p className="text-[12px] text-ink-3">You pay on PayPal&apos;s own secure window. We never see your card or login.</p>
      </div>
    </div>
  );
}
