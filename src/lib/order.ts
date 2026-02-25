// src/lib/order.ts

export type PaymentMethod = "cash" | "card";

export type TicketItem = {
  id?: string;
  name: string;
  qty: number;
  price?: number;
};

export type Order = {
  id: string;            // ex: 20260219-003
  createdAt: string;     // ISO
  customerName?: string;
  items: TicketItem[];
  payment: PaymentMethod;
};

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`; // 20260219
}

function nextDailyNumber() {
  // compteur par jour dans localStorage
  const key = `af_order_seq_${todayKey()}`;
  const cur = Number(localStorage.getItem(key) || "0");
  const next = cur + 1;
  localStorage.setItem(key, String(next));
  return next;
}

export function makeOrderId() {
  const seq = nextDailyNumber();
  return `${todayKey()}-${pad3(seq)}`; // 20260219-003
}

export function cartToTicketItems(cart: Array<{ id?: string; name: string; qty: number; price?: number }>): TicketItem[] {
  // simplifie si ton cart a plus de champs
  return cart.map((it) => ({ id: it.id, name: it.name, qty: it.qty, price: it.price }));
}

export function makeQrPayload(order: Order) {
  // payload simple : lisible + facile à scanner
  // (si plus tard tu fais une page /order/[id], on pourra mettre une URL)
  const lines = [
    `AFROFOOD|${order.id}`,
    `DATE:${order.createdAt}`,
    order.customerName ? `NAME:${order.customerName}` : "",
    `PAY:${order.payment}`,
    ...order.items.map((it) => `ITEM:${it.qty}x ${it.name}`),
  ].filter(Boolean);

  return lines.join("\n");
}
