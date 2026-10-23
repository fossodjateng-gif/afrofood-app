import type { PricingKind } from "@/lib/pricing";
export type OrderStatus =
  | "PENDING_PAYMENT"
  | "NEW"
  | "IN_PROGRESS"
  | "READY"
  | "DONE"
  | "CANCELED";
export type PaymentMethod = "cash" | "card" | "cashless";

export type OrderItem = {
  pricingKind?: PricingKind;
  id?: string;
  name: string;
  qty: number;
  price?: number;
  note?: string;
  unitNotes?: string[];
};

export type OrderRow = {
  refund?: { state: "requested" | "processing" | "refunded" | "requires_review"; amountCents: number; currency: string; refundedAt: string | null } | null;
  can_refund?: boolean;
  created_by?: string | null;
  created_by_username?: string | null;
  register_id?: string | null;
  register_name?: string | null;
  paid_by?: string | null;
  paid_by_username?: string | null;
  paid_register_id?: string | null;
  paid_register_name?: string | null;
  id: string;                // ex: AF-20260219-001
  created_at: string;        // ISO
  customer_name: string | null;
  payment: PaymentMethod;
  pos_card_key?: string | null;
  pos_card_state?: string | null;
  pos_card_user_id?: string | null;
  pos_card_username?: string | null;
  stripe_pi_started_at?: string | null;
  quantity_applied?: boolean | null;
  payment_provider?: string | null;
  stripe_payment_intent_id?: string | null;
  amount_cents?: number | null;
  cash_received_cents?: number | null;
  change_given_cents?: number | null;
  currency?: string | null;
  paid_at?: string | null;
  payment_error?: string | null;
  event_id?: string | null;
  event_name?: string | null;
  reservation_requested?: boolean | null;
  reservation_time?: string | null;
  status: OrderStatus;
  items: OrderItem[];        // JSON
};
