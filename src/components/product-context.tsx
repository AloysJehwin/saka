"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "@/lib/client/api";

export type CatalogItem = { code: string; description: string; lastListPrice: number; currentPrice: number; weeklyUnits: number; lines: number };
type Ctx = { products: CatalogItem[] | null; code: string | null; product: CatalogItem | null; setCode: (c: string) => void; error: string | null };

const ProductContext = createContext<Ctx | null>(null);
const KEY = "saka_product";
const DEFAULT = "85099B"; // Jumbo Bag Red White Spotty: the product with a real list-price change in the history

export function ProductProvider({ children }: { children: ReactNode }) {
  const { data, error } = useApi<CatalogItem[]>("/api/products");
  const [code, setCodeState] = useState<string | null>(null);
  useEffect(() => {
    if (!data?.length) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    const pick = [saved, DEFAULT].find((c) => c && data.some((p) => p.code === c)) ?? data[0].code;
    setCodeState(pick);
  }, [data]);
  const value = useMemo<Ctx>(() => ({
    products: data, code, error,
    product: data?.find((p) => p.code === code) ?? null,
    setCode: (c: string) => { setCodeState(c); try { localStorage.setItem(KEY, c); } catch { /* storage blocked */ } },
  }), [data, code, error]);
  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

export function useProduct() {
  const c = useContext(ProductContext);
  if (!c) throw new Error("useProduct must be used inside ProductProvider");
  return c;
}

/** Hand a chosen price or proposal from one screen to the next without putting it in the URL. */
export const handoff = {
  set(key: "price" | "proposal", value: unknown) { try { sessionStorage.setItem(`saka_${key}`, JSON.stringify(value)); } catch { /* ignore */ } },
  take<T>(key: "price" | "proposal"): T | null {
    try { const v = sessionStorage.getItem(`saka_${key}`); sessionStorage.removeItem(`saka_${key}`); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
  },
};
