"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LayoutGrid, History, SlidersHorizontal, FlaskConical, Stamp, LogOut, Gift } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { ProductProvider, useProduct } from "./product-context";
import { inputCls } from "./ui";
import { gbp } from "@/lib/client/format";

const NAV = [
  { href: "/app", label: "Overview", icon: LayoutGrid },
  { href: "/app/history", label: "History check", icon: History },
  { href: "/app/what-if", label: "What-if", icon: SlidersHorizontal },
  { href: "/app/test", label: "Price test", icon: FlaskConical },
  { href: "/app/apply", label: "Apply", icon: Stamp },
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <ProductProvider>
      <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
        <Rail />
        <div className="min-w-0">
          <ProductBar />
          <main className="mx-auto w-full max-w-[1320px] px-5 pb-20 pt-8 md:px-10">{children}</main>
        </div>
      </div>
    </ProductProvider>
  );
}

function Rail() {
  const path = usePathname();
  const { data: session } = authClient.useSession();
  const user = session?.user;
  return (
    <div className="bg-rail"><aside className="sticky top-0 z-30 flex flex-col bg-rail text-rail-ink md:h-dvh">
      <div className="flex items-baseline gap-2 px-5 pb-4 pt-5 md:pb-8">
        <Link href="/app" className="text-[22px] font-bold tracking-[-0.04em]">saka</Link>
        <span className="text-[12px] text-rail-ink-2">PriceTwin</span>
      </div>
      <nav aria-label="Steps" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:gap-0.5 md:overflow-visible md:pb-0">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/app" ? path === "/app" : path.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}
              className={`step flex h-10 shrink-0 items-center gap-3 px-3 text-[14px] ${active ? "bg-rail-ink text-rail" : "text-rail-ink hover:bg-rail-rule"}`}>
              <Icon className="size-4" strokeWidth={1.75} aria-hidden />
              <span className="whitespace-nowrap">{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden flex-col gap-0.5 px-3 pb-3 md:flex">
        <a href="/store/club" target="_blank" rel="noreferrer" className="flex h-9 items-center gap-3 px-3 text-[13px] text-rail-ink-2 hover:bg-rail-rule hover:text-rail-ink">
          <Gift className="size-4" strokeWidth={1.75} aria-hidden />Gift Box Club page
        </a>
        {user && (
          <div className="mt-3 flex items-center gap-3 border-t border-rail-rule px-3 pt-4">
            {user.image ? <img src={user.image} alt="" className="size-8 shrink-0" /> : <span className="grid size-8 shrink-0 place-items-center bg-rail-ink text-[13px] font-bold text-rail">{(user.name || user.email)[0]?.toUpperCase()}</span>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{user.name || user.email}</p>
              <p className="truncate text-[12px] text-rail-ink-2">{user.email}</p>
            </div>
            <button aria-label="Sign out" title="Sign out" className="grid size-8 place-items-center text-rail-ink-2 hover:bg-rail-rule hover:text-rail-ink"
              onClick={() => authClient.signOut().then(() => { window.location.href = "/sign-in"; })}>
              <LogOut className="size-4" strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>
    </aside></div>
  );
}

function ProductBar() {
  const { products, code, setCode, product, error } = useProduct();
  return (
    <div className="sticky top-0 z-20 border-b border-rule bg-sheet">
      <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 md:px-10">
        <label className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-[13px] text-ink-3">Product</span>
          {products ? (
            <select value={code ?? ""} onChange={(e) => setCode(e.target.value)} className={`${inputCls} min-w-0 max-w-[460px] flex-1 font-medium`}>
              {products.map((p) => <option key={p.code} value={p.code}>{p.description} · {p.code}</option>)}
            </select>
          ) : <span className="text-[13px] text-ink-3">{error ?? "Loading products…"}</span>}
        </label>
        {product && (
          <p className="text-[13px] text-ink-2 num">
            Charging <span className="font-semibold text-ink">{gbp(product.currentPrice)}</span>
            <span className="mx-2 text-rule-2">|</span>Real sales history to Dec 2011 · PayPal sandbox
          </p>
        )}
      </div>
    </div>
  );
}
