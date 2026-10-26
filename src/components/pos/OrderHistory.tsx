"use client";

import { useEffect, useState } from "react";
import { OnDemandOrderReceipt } from "@/components/OnDemandOrderReceipt";
import type { ReceiptLabels } from "@/components/OrderReceipt";
import type { OrderRow } from "@/lib/schema";
import type { Lang } from "@/lib/translations";
import styles from "./pos.module.css";
import { RefundAction } from "@/components/pos/RefundAction";

const PAGE_SIZE = 50;
const statusLabels = {
  de: { NEW: "Neue Bestellung", IN_PROGRESS: "In Zubereitung", READY: "Bereit", DONE: "Abgeschlossen", PENDING_PAYMENT: "Zahlung ausstehend", CANCELED: "Storniert" },
  fr: { NEW: "Nouvelle commande", IN_PROGRESS: "En préparation", READY: "Prête", DONE: "Terminée", PENDING_PAYMENT: "Paiement en attente", CANCELED: "Annulée" },
  en: { NEW: "New order", IN_PROGRESS: "In preparation", READY: "Ready", DONE: "Completed", PENDING_PAYMENT: "Payment pending", CANCELED: "Canceled" },
};
const paymentLabels = {
  de: { cash: "Barzahlung", card: "Kartenzahlung", cashless: "Cashless" },
  fr: { cash: "Espèces", card: "Carte", cashless: "Cashless" },
  en: { cash: "Cash", card: "Card", cashless: "Cashless" },
};
const labels: Record<Lang, ReceiptLabels> = {
  de: { ticketTitle: "Kundenbeleg", ticketSub: "Ausgestellt nach Zahlungsfreigabe", order: "Bestellung", name: "Name", payment: "Zahlung", total: "Gesamt", ticketLegend: "(1) Enthalt Gluten - (2) Enthalt Sellerie", ticketSent: "Bestellung an die Kuche gesendet", thanks: "Vielen Dank!", reprint: "Beleg drucken" },
  fr: { ticketTitle: "Ticket Client", ticketSub: "Emis apres validation paiement", order: "Commande", name: "Nom", payment: "Paiement", total: "Total", ticketLegend: "(1) Contient gluten - (2) Contient celeri", ticketSent: "Commande envoyee en cuisine", thanks: "Merci!", reprint: "Imprimer ticket" },
  en: { ticketTitle: "Customer ticket", ticketSub: "Issued after payment validation", order: "Order", name: "Name", payment: "Payment", total: "Total", ticketLegend: "(1) Contains gluten - (2) Contains celery", ticketSent: "Order sent to kitchen", thanks: "Thank you!", reprint: "Print receipt" },
};

export function OrderHistory({ eventId, lang, selectedOrderId, onSelect }: {
  eventId: string; lang: Lang; selectedOrderId: string | null; onSelect: (id: string | null) => void;
}) {
  const [snapshot, setSnapshot] = useState<{ eventId: string; offset: number; orders: OrderRow[]; hasMore: boolean } | null>(null);
  const [offset, setOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const text = {
    de: { title: "Verkaufshistorie", empty: "Keine bestätigten Verkäufe für dieses Event.", refresh: "Aktualisieren", loading: "Verkäufe werden geladen…", previous: "Zurück", next: "Weitere Verkäufe", error: "Verkaufshistorie konnte nicht geladen werden.", close: "Beleg schließen" },
    fr: { title: "Historique des ventes", empty: "Aucune vente validée pour cet événement.", refresh: "Actualiser", loading: "Chargement des ventes…", previous: "Précédent", next: "Ventes suivantes", error: "Impossible de charger l’historique.", close: "Fermer le ticket" },
    en: { title: "Sales history", empty: "No confirmed sales for this event.", refresh: "Refresh", loading: "Loading sales…", previous: "Previous", next: "More sales", error: "Unable to load sales history.", close: "Close receipt" },
  }[lang];

  useEffect(() => {
    if (!eventId) return;
    let stopped = false;
    let controller: AbortController | null = null;
    async function load() {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const params = new URLSearchParams({ eventId, limit: String(PAGE_SIZE), offset: String(offset) });
        const response = await fetch(`/api/orders/history?${params}`, { cache: "no-store", signal });
        const data = await response.json();
        if (!response.ok || data.eventId !== eventId || !Array.isArray(data.orders)
          || data.orders.some((order: OrderRow) => order.event_id !== eventId)) throw new Error("Invalid history response");
        if (!stopped && !signal.aborted) {
          setSnapshot({ eventId, offset, orders: data.orders, hasMore: data.hasMore === true });
          setError(null);
        }
      } catch {
        if (!stopped && !signal.aborted) setError(text.error);
      }
    }
    void load();
    const interval = window.setInterval(() => void load(), 15000);
    return () => { stopped = true; controller?.abort(); window.clearInterval(interval); };
  }, [eventId, offset, refreshKey, text.error]);

  if (!eventId) return null;
  const current = snapshot?.eventId === eventId && snapshot.offset === offset ? snapshot : null;
  const locale = lang === "de" ? "de-DE" : lang === "fr" ? "fr-FR" : "en-GB";
  return <section className={styles.history} aria-label={text.title} style={{ marginTop: 24, padding: 16, border: "1px solid #F1D7C8", borderRadius: 12, background: "white", color: "#111" }}>
    <h2>{text.title}</h2>
    <button type="button" className="af-link-btn" onClick={() => setRefreshKey((key) => key + 1)}>{text.refresh}</button>
    {error ? <p role="alert">{error}</p> : null}
    {!current && !error ? <p role="status">{text.loading}</p> : null}
    {current?.orders.length === 0 ? <p>{text.empty}</p> : null}
    {current?.orders.map((order) => <article key={order.id} style={{ padding: "12px 0", borderBottom: "1px solid #ddd" }}>
      <strong>{order.id}</strong> · <time dateTime={order.paid_at || order.created_at}>{new Date(order.paid_at || order.created_at).toLocaleString(locale)}</time>
      <ul>{order.items.map((item, index) => <li key={index}>{item.name} × {item.qty}</li>)}</ul>
      <p>{Number.isSafeInteger(order.amount_cents) ? new Intl.NumberFormat(locale, { style: "currency", currency: order.currency || "eur" }).format(Number(order.amount_cents) / 100) : "—"} · {paymentLabels[lang][order.payment] || "—"} · {statusLabels[lang][order.status] || "—"}</p>
      <RefundAction payment={order.payment} orderId={order.id} amountCents={order.amount_cents || 0} currency={order.currency || "eur"} eligible={order.can_refund === true} refund={order.refund} lang={lang} onRefresh={() => setRefreshKey((key) => key + 1)} />
      <p>{order.event_name || order.event_id || "—"} · {order.created_by_username || "—"} / {order.register_name || "—"} · {order.paid_by_username || "—"} / {order.paid_register_name || "—"}</p>
      <OnDemandOrderReceipt order={order} lang={lang} labels={labels[lang]} showEvent
        requested={selectedOrderId === order.id} onRequest={() => onSelect(order.id)} onPrint={() => window.print()} />
      {selectedOrderId === order.id ? <button type="button" className="af-link-btn" onClick={() => onSelect(null)}>{text.close}</button> : null}
    </article>)}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
      <button type="button" disabled={offset === 0} onClick={() => { onSelect(null); setOffset(Math.max(0, offset - PAGE_SIZE)); }}>{text.previous}</button>
      <button type="button" disabled={!current?.hasMore} onClick={() => { onSelect(null); setOffset(offset + PAGE_SIZE); }}>{text.next}</button>
    </div>
  </section>;
}
