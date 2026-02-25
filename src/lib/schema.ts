export type OrderStatus =
  | "PENDING_PAYMENT"
  | "NEW"
  | "IN_PROGRESS"
  | "READY"
  | "DONE";
export type PaymentMethod = "cash" | "card";

export type OrderItem = {
  id?: string;
  name: string;
  qty: number;
  price?: number;
};

export type OrderRow = {
  id: string;                // ex: AF-20260219-001
  created_at: string;        // ISO
  customer_name: string | null;
  payment: PaymentMethod;
  payment_provider?: string | null;
  stripe_payment_intent_id?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  paid_at?: string | null;
  payment_error?: string | null;
  status: OrderStatus;
  items: OrderItem[];        // JSON
};
