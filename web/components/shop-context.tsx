"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Basket, Category, Item } from "@/lib/data";
import type { Method } from "@/lib/mining/rules";
import type { AlgorithmId } from "@/lib/mining/types";

export interface Persona {
  id: number;
  country: string;
  history: Basket[];
  heldOut: Basket;
}

export interface RecSettings {
  method: Method;
  /** Thuật toán dùng để khai thác mẫu cho phần gợi ý. */
  algorithm: AlgorithmId;
  minsupPct: number;
  maxLength: number;
  minConfidence: number;
  excludeBought: boolean;
}

interface Catalog {
  items: Item[];
  categories: Category[];
  personas: Persona[];
  sequences: number;
}

interface ShopState {
  catalog: Catalog | null;
  error: string | null;
  /** null = khách mới chưa có lịch sử. */
  persona: Persona | null;
  selectPersona: (id: number | null) => void;
  /** Lịch sử mua của khách đang xem (lịch sử gốc + các đơn vừa đặt trong phiên demo). */
  history: Basket[];
  /** Số đơn đặt thêm trong phiên demo. */
  newOrders: number;
  cart: number[];
  addToCart: (id: number) => void;
  removeFromCart: (id: number) => void;
  checkout: () => void;
  resetHistory: () => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  settings: RecSettings;
  updateSettings: (patch: Partial<RecSettings>) => void;
  query: string;
  setQuery: (q: string) => void;
  /** Góc nhìn kỹ thuật: hiện luật, độ đo và công tắc thuật toán ngay trong cửa hàng. */
  analysis: boolean;
  setAnalysis: (on: boolean) => void;
  toast: string | null;
}

const Ctx = createContext<ShopState | null>(null);

export const DEFAULT_SETTINGS: RecSettings = {
  method: "sequential",
  algorithm: "prefixspan",
  minsupPct: 3,
  maxLength: 3,
  minConfidence: 0.1,
  excludeBought: false,
};

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<number | null>(null);
  const [extra, setExtra] = useState<Basket[]>([]);
  const [cart, setCart] = useState<number[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [settings, setSettings] = useState<RecSettings>(DEFAULT_SETTINGS);
  const [query, setQuery] = useState("");
  const [analysis, setAnalysis] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((c: Catalog) => {
        setCatalog(c);
        setPersonaId(c.personas[0]?.id ?? null);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const persona = useMemo(() => catalog?.personas.find((p) => p.id === personaId) ?? null, [catalog, personaId]);
  const history = useMemo(() => [...(persona?.history ?? []), ...extra], [persona, extra]);

  const selectPersona = useCallback((id: number | null) => {
    setPersonaId(id);
    setExtra([]);
    setCart([]);
  }, []);
  const addToCart = useCallback((id: number) => setCart((c) => (c.includes(id) ? c : [...c, id])), []);
  const removeFromCart = useCallback((id: number) => setCart((c) => c.filter((x) => x !== id)), []);
  const checkout = useCallback(() => {
    if (cart.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    setExtra((e) => [...e, { date, items: [...cart].sort((a, b) => a - b) }]);
    setCart([]);
    setCartOpen(false);
    setToast("Đặt hàng thành công. Gợi ý dành cho bạn vừa được cập nhật.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [cart]);
  const resetHistory = useCallback(() => setExtra([]), []);
  const updateSettings = useCallback((patch: Partial<RecSettings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const value: ShopState = {
    catalog,
    error,
    persona,
    selectPersona,
    history,
    newOrders: extra.length,
    cart,
    addToCart,
    removeFromCart,
    checkout,
    resetHistory,
    cartOpen,
    setCartOpen,
    settings,
    updateSettings,
    query,
    setQuery,
    analysis,
    setAnalysis,
    toast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShop(): ShopState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShop phải nằm trong ShopProvider");
  return v;
}
