import type { PricingKind } from "@/lib/pricing";
import type { CatalogMenuItem, LocalizedText } from "@/lib/menu-catalog";
import type { ItemAvailability } from "@/lib/menu-settings";
import { getOrderPriceBreakdown } from "@/lib/pricing";

export type PosProduct = CatalogMenuItem & {
  price: number;
  visible: boolean;
  availability?: ItemAvailability;
};

export type PosSection = {
  id: string;
  title: LocalizedText;
  items: PosProduct[];
};

export type PosCartItem = {
  pricingKind?: PricingKind;
  id: string;
  name: string;
  price: number;
  qty: number;
};

export const POS_CART_PREFIX = "af_pos_cart_v1:";

export function posCartKey(userId: string, eventId: string) {
  return `${POS_CART_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(eventId)}`;
}

export function readPosCart(key: string): PosCartItem[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw.flatMap((value: unknown) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Partial<PosCartItem>;
      if (
        typeof item.id !== "string" || !item.id.trim() || seen.has(item.id) ||
        typeof item.name !== "string" || !item.name.trim() ||
        typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0 ||
        typeof item.qty !== "number" || !Number.isSafeInteger(item.qty) || item.qty <= 0
      ) return [];
      seen.add(item.id);
      return [{ pricingKind: item.pricingKind === "dip" ? "dip" : item.pricingKind === "regular" ? "regular" : undefined, id: item.id, name: item.name, price: item.price, qty: item.qty }];
    });
  } catch {
    return [];
  }
}

export function writePosCart(key: string, items: PosCartItem[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function getProductLimit(product: PosProduct) {
  if (!product.visible || !Number.isFinite(product.price) || product.price < 0) return 0;
  if (product.availability?.status === "blocked") return 0;
  if (product.availability?.status === "limited") {
    const remaining = product.availability.remainingQty;
    return typeof remaining === "number" && Number.isFinite(remaining)
      ? Math.max(0, Math.floor(remaining))
      : 0;
  }
  return Number.POSITIVE_INFINITY;
}

export function reconcilePosCart(items: PosCartItem[], products: Map<string, PosProduct>) {
  // Keep unavailable lines visible so the cashier can remove them explicitly.
  return items.map((item) => {
    const product = products.get(item.id);
    return product && Number.isFinite(product.price) && product.price >= 0
      ? { ...item, pricingKind: product.pricingKind, name: product.name.de, price: product.price }
      : item;
  });
}

export function addPosProduct(items: PosCartItem[], product: PosProduct) {
  const existing = items.find((item) => item.id === product.id);
  if ((existing?.qty || 0) >= getProductLimit(product)) return items;
  return existing
    ? items.map((item) => item.id === product.id ? { ...item, qty: item.qty + 1 } : item)
    : [...items, { pricingKind: product.pricingKind, id: product.id, name: product.name.de, price: product.price, qty: 1 }];
}

export function decreasePosProduct(items: PosCartItem[], id: string) {
  return items.flatMap((item) => item.id !== id ? [item] : item.qty > 1 ? [{ ...item, qty: item.qty - 1 }] : []);
}

export function getPosBreakdown(items: PosCartItem[]) {
  return getOrderPriceBreakdown(items);
}

export function formatPosMoney(cents: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
}
