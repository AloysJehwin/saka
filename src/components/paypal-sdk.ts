"use client";

type Buttons = { render: (el: HTMLElement) => Promise<void>; isEligible: () => boolean; close?: () => Promise<void> };
export type PayPalNamespace = { Buttons: (opts: Record<string, unknown>) => Buttons };
declare global { interface Window { paypal?: PayPalNamespace } }

let current: { src: string; promise: Promise<PayPalNamespace> } | null = null;

/**
 * Load the PayPal JS SDK once per configuration (checkout and subscriptions need different query params).
 * The promise is shared, so a second caller (React re-running an effect) waits on the same script instead of
 * tearing it down mid-load.
 */
export function loadPayPal(params: Record<string, string>): Promise<PayPalNamespace> {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  if (!clientId) return Promise.reject(new Error("PayPal isn't configured: NEXT_PUBLIC_PAYPAL_CLIENT_ID is missing."));
  const src = `https://www.paypal.com/sdk/js?${new URLSearchParams({ "client-id": clientId, components: "buttons", ...params })}`;
  if (current?.src === src) return current.promise;
  document.querySelector("script[data-paypal-sdk]")?.remove();
  delete window.paypal;
  const promise = new Promise<PayPalNamespace>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.dataset.paypalSdk = "1";
    s.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal didn't load.")));
    s.onerror = () => reject(new Error("Couldn't reach PayPal. Check your connection and reload."));
    document.head.appendChild(s);
  });
  current = { src, promise };
  promise.catch(() => { if (current?.promise === promise) current = null; });
  return promise;
}
