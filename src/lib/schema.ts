export type OrderStatus =
  | "PENDING_PAYMENT"
  | "NEW"
  | "IN_PROGRESS"
  | "READY"
  | "DONE";
export type PaymentMethod = "cash" | "paypal" | "card";

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
  status: OrderStatus;
  items: OrderItem[];        // JSON
};
