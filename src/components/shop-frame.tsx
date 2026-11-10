import type { ReactNode } from "react";

/** The demo shop's own frame: what a buyer sees. Clearly labelled as a sandbox demo. */
export function ShopFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-sheet">
      <header className="bg-rail text-rail-ink">
        <div className="mx-auto flex max-w-[1080px] items-baseline justify-between gap-4 px-5 py-4 md:px-8">
          <p className="text-[22px] font-bold tracking-[-0.03em]">Kettle &amp; Twine</p>
          <p className="text-[12px] text-rail-ink-2">Demo gift shop · PayPal sandbox · prices in GBP</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1080px] flex-1 px-5 py-10 md:px-8 md:py-14">{children}</main>
      <footer className="border-t border-rule">
        <p className="mx-auto max-w-[1080px] px-5 py-5 text-[12px] text-ink-3 md:px-8">
          A demo storefront for saka. Payments run in the PayPal sandbox: pay with a sandbox personal account, no real money moves.
          Product data from the UCI Online Retail II dataset (CC BY 4.0).
        </p>
      </footer>
    </div>
  );
}
