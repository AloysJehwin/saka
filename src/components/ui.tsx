"use client";
import Link from "next/link";
import { useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import { Loader2, ArrowUpRight } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";

type Tone = "primary" | "secondary" | "danger" | "quiet";
const tones: Record<Tone, string> = {
  primary: "bg-ink text-paper hover:bg-red disabled:bg-ink-3",
  secondary: "border border-ink text-ink hover:bg-ink hover:text-paper disabled:border-rule-2 disabled:text-ink-3 disabled:hover:bg-transparent",
  danger: "border border-red text-red-ink hover:bg-red hover:text-white disabled:opacity-50",
  quiet: "text-ink underline decoration-rule-2 hover:decoration-ink disabled:text-ink-3",
};
const base = "step inline-flex items-center justify-center gap-2 font-medium disabled:cursor-not-allowed";
const sizes = { md: "h-10 px-4 text-[14px]", sm: "h-8 px-3 text-[13px]" };

export function Button({ tone = "primary", size = "md", busy, children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "md" | "sm"; busy?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || busy} className={`${base} ${tone === "quiet" ? "h-auto px-0" : sizes[size]} ${tones[tone]} ${className}`}>
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function LinkButton({ href, tone = "secondary", size = "md", external, children }: { href: string; tone?: Tone; size?: "md" | "sm"; external?: boolean; children: ReactNode }) {
  const cls = `${base} ${sizes[size]} ${tones[tone]}`;
  if (external) return <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}<ArrowUpRight className="size-4" aria-hidden /></a>;
  return <Link href={href} className={cls}>{children}</Link>;
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
    </label>
  );
}

export const inputCls = "h-10 border border-rule-2 bg-sheet px-3 text-[14px] hover:border-ink-3 focus:border-ink focus:outline-none disabled:bg-wash disabled:text-ink-3";

export function MoneyInput({ value, onChange, disabled, ariaLabel }: { value: number | ""; onChange: (v: number | "") => void; disabled?: boolean; ariaLabel?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">£</span>
      <input aria-label={ariaLabel} type="number" inputMode="decimal" step="0.01" min="0" disabled={disabled} value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} className={`${inputCls} w-full pl-7`} />
    </div>
  );
}

export function Status({ tone, children }: { tone: "testing" | "ready" | "stop" | "neutral" | "done"; children: ReactNode }) {
  const t = {
    testing: "text-amber border-amber",
    ready: "text-green border-green",
    stop: "text-red-ink border-red",
    neutral: "text-ink-2 border-rule-2",
    done: "text-ink border-ink",
  }[tone];
  return <span className={`inline-flex h-6 items-center gap-1.5 border px-2 text-[12px] font-semibold ${t}`}><span className="size-1.5 bg-current" aria-hidden />{children}</span>;
}

export function Section({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`border-t border-ink pt-4 ${className}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
        {aside && <div className="text-[13px] text-ink-3">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ title, lede, actions }: { title: ReactNode; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="max-w-[68ch]">
        <h1 className="text-balance text-[32px] font-bold leading-[1.05] tracking-[-0.03em] md:text-[40px]">{title}</h1>
        {lede && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return <p className="flex items-center gap-2 py-6 text-[14px] text-ink-3" role="status"><Loader2 className="size-4 animate-spin" aria-hidden />{label}…</p>;
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-red px-4 py-3 text-[14px] text-red-ink">
      <span>{children}</span>
      {onRetry && <Button tone="quiet" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="border-l border-ink pl-3 text-[13px] leading-relaxed text-ink-2">{children}</p>;
}

/**
 * Every write to PayPal goes through here: the seller reads exactly what will happen, then approves.
 * Results and PayPal refusals are shown inline, never hidden.
 */
export function ApproveAction<T>({ summary, label = "Approve", request, onDone, onSettled, disabled, renderResult }: {
  summary: ReactNode; label?: string; request: () => { path: string; body: unknown }; onDone?: (r: T) => void; onSettled?: () => void; disabled?: boolean; renderResult?: (r: T) => ReactNode;
}) {
  const [state, setState] = useState<{ busy: boolean; error?: ApiError; result?: T }>({ busy: false });
  const run = async () => {
    setState({ busy: true });
    try {
      const { path, body } = request();
      const r = await api<T>(path, { body });
      setState({ busy: false, result: r });
      onDone?.(r);
    } catch (e) {
      setState({ busy: false, error: e as ApiError });
    }
    onSettled?.();
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-ink-2">{summary}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} busy={state.busy} disabled={disabled}>{label}</Button>
      </div>
      {state.error && (
        <div role="alert" className="border border-red px-3 py-2 text-[13px] text-red-ink">
          <p className="font-semibold">PayPal did not accept this{state.error.paypal?.issue ? ` (${state.error.paypal.issue})` : ""}.</p>
          <p>{state.error.message}</p>
        </div>
      )}
      {state.result !== undefined && renderResult && <div className="border border-green px-3 py-2 text-[13px] text-ink">{renderResult(state.result)}</div>}
    </div>
  );
}
