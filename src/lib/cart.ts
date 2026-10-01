export type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  note?: string;
  unitNotes?: string[];
  redSauce: boolean;
  extraRedSauceQty: number;
};

const KEY = "afrofood_cart_v1";

function isDip(id: string) {
  return id.startsWith("dip-");
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

function sanitizeItem(raw: any): CartItem | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  const name = cleanText(String(raw.name || "").trim());
  const price = Number(raw.price || 0);
  const qty = Number(raw.qty || 0);
  const fallbackNote = String(raw.note || "").trim() || undefined;
  if (!id || !name || !Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return null;
  return {
    id,
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
    localStorage.setItem(KEY, JSON.stringify(items));
    return items;
  } catch {
    return [];
  }
}

function write(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function replaceCart(items: CartItem[]) {
  write(items);
}

export function getCart(): CartItem[] {
  return read();
}

export function addToCart(payload: Omit<CartItem, "qty">) {
  const cart = read();
  const idx = cart.findIndex((x) => x.id === payload.id);

  if (idx >= 0) {
    const it = cart[idx];
    it.name = payload.name;
    it.price = payload.price;
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
}

export function cartTotal(cart: CartItem[]): number {
  const base = cart.reduce((sum, it) => sum + it.price * it.qty, 0);
  const redExtras = cart.reduce((sum, it) => sum + it.extraRedSauceQty * 1, 0);
  const dipQtyTotal = cart
    .filter((it) => isDip(it.id))
    .reduce((sum, it) => sum + it.qty, 0);

  const dipExtra = Math.max(0, dipQtyTotal - 1) * 1;
  return base + redExtras + dipExtra;
}

export function incrementItem(id: string) {
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
}

export function updateItemNote(id: string, note: string) {
  updateItemUnitNote(id, 0, note);
}

export function updateItemUnitNote(id: string, index: number, note: string) {
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
}

export function decrementItem(id: string) {
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
}

export function removeItem(id: string) {
  const cart = getCart().filter((it) => it.id !== id);
  write(cart);
}

export function clearCart() {
  write([]);
}
