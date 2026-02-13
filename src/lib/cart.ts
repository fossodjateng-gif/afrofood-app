export type CartItem = {
  id: string;        // ex: "ingwersaft"
  name: string;      // affichage
  price: number;     // en euros
  qty: number;
  redSauce: boolean; // sauce rouge sur demande
  extraRedSauceQty: number; // extras payants plus tard
};

const KEY = "afrofood_cart_v1";

function isDip(id: string) {
  return id.startsWith("dip-");
}


function read(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function write(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function getCart(): CartItem[] {
  return read();
}

export function addToCart(payload: Omit<CartItem, "qty">) {
  const cart = read();
  const idx = cart.findIndex((x) => x.id === payload.id);

  if (idx >= 0) {
    const it = cart[idx];

    // on ajoute 1 quantité
    it.qty += 1;

    // sauce rouge demandée sur CET ajout
    if (payload.redSauce) {
      // si c'est la première fois qu'on demande sauce rouge sur cet item → gratuit
      if (!it.redSauce) {
        it.redSauce = true;
      } else {
        // sinon → extra payant
        it.extraRedSauceQty += 1;
      }
    }
  } else {
    // nouvel item
    cart.push({
      ...payload,
      qty: 1,
      // si sauce rouge demandée dès le départ: 1ère portion gratuite (redSauce=true, extra=0)
      redSauce: payload.redSauce,
      extraRedSauceQty: 0,
    });
  }

  write(cart);
}



export function cartTotal(cart: CartItem[]): number {
  // base
  const base = cart.reduce((sum, it) => sum + it.price * it.qty, 0);

  // extras sauce rouge (si activé chez toi)
  const redExtras = cart.reduce((sum, it) => sum + it.extraRedSauceQty * 1, 0);

  // ✅ dips : 1er gratuit, puis +1€ par dip supplémentaire
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
