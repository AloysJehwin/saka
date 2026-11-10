"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(public status: number, message: string, public paypal?: { name?: string; issue?: string; debugId?: string }) { super(message); }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && window.location.pathname.startsWith("/app")) {
    window.location.href = `/sign-in?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.paypal);
  return data as T;
}

/** Load JSON for a screen; `poll` re-fetches quietly every n ms. */
export function useApi<T>(path: string | null, poll?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const live = useRef(path);
  const load = useCallback(async (quiet = false) => {
    if (!path) return;
    if (!quiet) setLoading(true);
    try {
      const d = await api<T>(path);
      if (live.current === path) { setData(d); setError(null); }
    } catch (e) {
      if (live.current === path) setError((e as Error).message);
    } finally {
      if (live.current === path) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    live.current = path;
    setData(null);
    load();
    if (!poll || !path) return;
    const t = setInterval(() => load(true), poll);
    return () => clearInterval(t);
  }, [path, poll, load]);
  return { data, error, loading, reload: () => load(true) };
}
