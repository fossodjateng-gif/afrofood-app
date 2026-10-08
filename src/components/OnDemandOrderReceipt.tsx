"use client";

import { useState, type ComponentProps } from "react";
import { OrderReceipt } from "@/components/OrderReceipt";
import type { OrderRow } from "@/lib/schema";
import type { Lang } from "@/lib/translations";

export const receiptActionLabels: Record<Lang, string> = {
  de: "Beleg / Ticket", fr: "Reçu / Ticket", en: "Receipt / Ticket",
};

export function hasReceiptData(order: OrderRow | null) {
  return !!order?.id && !!order.created_at && Array.isArray(order.items) && order.items.length > 0
    && ["cash", "card", "cashless"].includes(order.payment)
    && Number.isSafeInteger(order.amount_cents) && Number(order.amount_cents) >= 0;
}

export function OnDemandOrderReceipt({ requested, onRequest, ...props }: ComponentProps<typeof OrderReceipt> & { requested?: boolean; onRequest?: () => void }) {
  const [requestedOrderId, setRequestedOrderId] = useState<string | null>(null);
  if (!hasReceiptData(props.order)) return null;
  return <div>
    <button type="button" className="af-link-btn" data-receipt-order-id={props.order.id}
      onClick={() => { setRequestedOrderId(props.order.id); onRequest?.(); }}>{receiptActionLabels[props.lang]}</button>
    {(requested ?? (requestedOrderId === props.order.id)) ? <OrderReceipt {...props} /> : null}
  </div>;
}
