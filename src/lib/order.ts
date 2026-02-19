import type { CartItem } from "@/lib/cart";

export type PaymentMethod = "cash" | "paypal" | "card";

export type Order = {
  id: string;            // ex: AF-20260217-4932
  createdAt: string;     // ISO date
  customerName?: string; // optionnel
  items: Array<{ name: string; qty: number }>;
  payment: PaymentMethod;
};

export function makeOrderId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `AF-${y}${m}${day}-${rnd}`;
}

export function cartToTicketItems(cart: CartItem[]) {
  // Ticket = items + quantités, SANS prix
  return cart.map((it) => ({
    name: it.name,
    qty: it.qty,
  }));
}
