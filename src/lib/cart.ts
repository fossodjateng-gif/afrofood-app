import { calculateOrderTotalCents, type PricingKind } from "@/lib/pricing";
export type CartItem = {
  pricingKind?: PricingKind;
  id: string;
  name: string;
  price: number;
  qty: number;
  note?: string;
  unitNotes?: string[];
  redSauce: boolean;
  extraRedSauceQty: number;
};

export const CART_KEY = "afrofood_cart_v1";
const KEY = CART_KEY;
const REVISION_KEY = "af_cart_revision_v1";
export const CART_CHANGED = "af-cart-changed";
export const CART_LOCK = "af-public-cart-v1";

// All public-cart writers must participate. Web Locks coordinates same-origin tabs.
// Mutations still work without it, but destructive automatic cleanup must opt out.
export function withCartLock<T>(operation: () => T, withoutLock: () => T = operation): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks?.request) return Promise.resolve(withoutLock());
  return navigator.locks.request(CART_LOCK, { mode: "exclusive" }, operation);
}

function cleanText(value: string) {
  return value
    .replaceAll("GrÃƒÂ¼ne", "Grune")
    .replaceAll("AttiÃƒÂ©kÃƒÂ©", "Attieke")
    .replaceAll("HÃƒÂ¤hnchenfÃƒÂ¼llung", "Hahnchenfullung")
    .replaceAll("ÃƒÂ¼", "u")
    .replaceAll("ÃƒÂ¤", "a")
    .replaceAll("ÃƒÂ¶", "o")
    .replaceAll("Ã¢â‚¬â€œ", "-")
    .replaceAll("Ã¢â‚¬Â¢", "-")
    .replaceAll("Ã¢â€šÂ¬", "EUR");
}

function normalizeUnitNotes(rawNotes: unknown, qty: number, fallbackNote?: string) {
  const notes = Array.isArray(rawNotes)
    ? rawNotes.map((note) => String(note || "").trim()).slice(0, qty)
    : [];
  while (notes.length < qty) {
    notes.push("");
  }
  if (fallbackNote && !notes.some((note) => note.trim())) {
    notes[0] = fallbackNote;
  }
  return notes;
}

function sanitizeItem(value: unknown): CartItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = String(raw.id || "").trim();
  const name = cleanText(String(raw.name || "").trim());
  const price = Number(raw.price || 0);
  const qty = Number(raw.qty || 0);
  const fallbackNote = String(raw.note || "").trim() || undefined;
  if (!id || !name || !Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return null;
  return {
    id,
    pricingKind: raw.pricingKind === "dip" ? "dip" : raw.pricingKind === "regular" ? "regular" : undefined,
    name,
    price,
    qty,
    note: fallbackNote,
    unitNotes: normalizeUnitNotes(raw.unitNotes, qty, fallbackNote),
    redSauce: Boolean(raw.redSauce),
    extraRedSauceQty: Number.isFinite(Number(raw.extraRedSauceQty)) ? Number(raw.extraRedSauceQty) : 0,
  };
}

function read(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    const items = Array.isArray(parsed) ? (parsed.map(sanitizeItem).filter(Boolean) as CartItem[]) : [];
    return items;
  } catch {
    return [];
  }
}

function write(items: CartItem[]) {
  // Every committed edit/replacement is a new revision, even with identical lines.
  localStorage.setItem(REVISION_KEY, crypto.randomUUID());
  localStorage.setItem(KEY, JSON.stringify(items));
  if (typeof window !== "undefined") window.dispatchEvent?.(new Event(CART_CHANGED));
}

export function cartSnapshot() {
  const items = getCart();
  const revision = localStorage.getItem(REVISION_KEY) || "";
  return { revision, fingerprint: JSON.stringify(items), items };
}

export function captureCartSnapshot() {
  return withCartLock(() => {
    if (!localStorage.getItem(REVISION_KEY)) localStorage.setItem(REVISION_KEY, crypto.randomUUID());
    return cartSnapshot();
  });
}

function cartEventSnapshot() {
  return {
    ...cartSnapshot(),
    eventId: localStorage.getItem("af_event_id") || "",
    eventName: localStorage.getItem("af_event_name") || "",
    lastOrderId: localStorage.getItem("af_last_order_id"),
  };
}

export function captureCartEventSnapshot() {
  return withCartLock(cartEventSnapshot);
}

export function changeCartEvent(expected: Awaited<ReturnType<typeof captureCartEventSnapshot>>, next: { id: string; name: string }) {
  const change = (locked: boolean): "changed" | "conflict" | "unavailable" => {
    const current = cartEventSnapshot();
    if (current.eventId !== expected.eventId || current.eventName !== expected.eventName
      || current.revision !== expected.revision || current.fingerprint !== expected.fingerprint
      || current.lastOrderId !== expected.lastOrderId) return "conflict";
    const switching = !!current.eventId && current.eventId !== next.id;
    // Without cross-tab coordination, never perform a destructive event switch.
    if (switching && !locked) return "unavailable";
    if (switching) {
      write([]);
      localStorage.removeItem("af_last_order_id");
    }
    localStorage.setItem("af_event_id", next.id);
    localStorage.setItem("af_event_name", next.name);
    return "changed";
  };
  return withCartLock(() => change(true), () => change(false));
}

export function replaceCart(items: CartItem[], expected?: ReturnType<typeof cartSnapshot>) {
  return withCartLock(() => {
    const current = cartSnapshot();
    if (expected && (current.revision !== expected.revision || current.fingerprint !== expected.fingerprint)) return false;
    write(items);
    return true;
  });
}

// Caller holds CART_LOCK. Re-read the actual stored basket immediately before writing.
export function clearCartIfUnchanged(expected: Pick<ReturnType<typeof cartSnapshot>, "revision" | "fingerprint">) {
  const current = cartSnapshot();
  if (!expected.revision || current.revision !== expected.revision || current.fingerprint !== expected.fingerprint) return false;
  write([]);
  return true;
}

export function getCart(): CartItem[] {
  return read();
}

export function addToCart(payload: Omit<CartItem, "qty">) {
  return withCartLock(() => {
    const cart = read();
    const idx = cart.findIndex((x) => x.id === payload.id);

    if (idx >= 0) {
      const it = cart[idx];
      it.name = payload.name;
      it.price = payload.price;
      it.pricingKind = payload.pricingKind;
      it.qty += 1;
      it.unitNotes = normalizeUnitNotes(it.unitNotes, it.qty, it.note);

      if (payload.redSauce) {
        if (!it.redSauce) {
          it.redSauce = true;
        } else {
          it.extraRedSauceQty += 1;
        }
      }
    } else {
      cart.push({
        ...payload,
        qty: 1,
        unitNotes: normalizeUnitNotes(payload.unitNotes, 1, payload.note),
        redSauce: payload.redSauce,
        extraRedSauceQty: 0,
      });
    }

    write(cart);
  });
}

export function cartTotal(cart: CartItem[]): number {
  return calculateOrderTotalCents(cart) / 100;
}

export function incrementItem(id: string) {
  return withCartLock(() => {
    const cart = getCart();
    const next = cart.map((it) =>
      it.id === id
        ? {
            ...it,
            qty: it.qty + 1,
            unitNotes: normalizeUnitNotes(it.unitNotes, it.qty + 1, it.note),
          }
        : it
    );
    write(next);
  });
}

export function updateItemNote(id: string, note: string) {
  return updateItemUnitNote(id, 0, note);
}

export function updateItemUnitNote(id: string, index: number, note: string) {
  return withCartLock(() => {
    const normalized = String(note || "").trim();
    const cart = getCart();
    const next = cart.map((it) => {
      if (it.id !== id) return it;
      const unitNotes = normalizeUnitNotes(it.unitNotes, it.qty, it.note);
      if (index < 0 || index >= unitNotes.length) return it;
      unitNotes[index] = normalized;
      return {
        ...it,
        note: unitNotes[0] || undefined,
        unitNotes,
      };
    });
    write(next);
  });
}

export function decrementItem(id: string) {
  return withCartLock(() => {
    const cart = getCart();
    const next = cart
      .map((it) =>
        it.id === id
          ? {
              ...it,
              qty: it.qty - 1,
              unitNotes: normalizeUnitNotes(it.unitNotes, Math.max(0, it.qty - 1), it.note),
              note: normalizeUnitNotes(it.unitNotes, Math.max(0, it.qty - 1), it.note)[0] || undefined,
            }
          : it
      )
      .filter((it) => it.qty > 0);
    write(next);
  });
}

export function removeItem(id: string) {
  return withCartLock(() => {
    const cart = getCart().filter((it) => it.id !== id);
    write(cart);
  });
}

export function clearCart() {
  return withCartLock(() => write([]));
}
