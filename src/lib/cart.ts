export type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  redSauce: boolean;
  extraRedSauceQty: number;
};

const KEY = "afrofood_cart_v1";

function isDip(id: string) {
  return id.startsWith("dip-");
}

function cleanText(value: string) {
  return value
    .replaceAll("GrÃ¼ne", "Grune")
    .replaceAll("AttiÃ©kÃ©", "Attieke")
    .replaceAll("HÃ¤hnchenfÃ¼llung", "Hahnchenfullung")
    .replaceAll("Ã¼", "u")
    .replaceAll("Ã¤", "a")
    .replaceAll("Ã¶", "o")
    .replaceAll("â€“", "-")
    .replaceAll("â€¢", "-")
    .replaceAll("â‚¬", "EUR");
}

function sanitizeItem(raw: any): CartItem | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  const name = cleanText(String(raw.name || "").trim());
  const price = Number(raw.price || 0);
  const qty = Number(raw.qty || 0);
  if (!id || !name || !Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return null;
  return {
    id,
    name,
    price,
    qty,
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
  const next = cart.map((it) => (it.id === id ? { ...it, qty: it.qty + 1 } : it));
  write(next);
}

export function decrementItem(id: string) {
  const cart = getCart();
  const next = cart
    .map((it) => (it.id === id ? { ...it, qty: it.qty - 1 } : it))
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
