"use client";

import { useEffect, useState } from "react";
import { OnDemandOrderReceipt } from "@/components/OnDemandOrderReceipt";
import type { ReceiptLabels } from "@/components/OrderReceipt";
import type { OrderRow } from "@/lib/schema";
import type { Lang } from "@/lib/translations";
import styles from "./pos.module.css";
import dayStyles from "./order-history.module.css";
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
    de: { title: "Verkaufshistorie", empty: "Keine bestätigten Verkäufe für dieses Event.", refresh: "Aktualisieren", loading: "Verkäufe werden geladen…", previous: "Zurück", next: "Weitere Verkäufe", error: "Verkaufshistorie konnte nicht geladen werden.", close: "Beleg schließen", details: "Details", original: "Ursprünglicher Betrag", preparation: "Zubereitungsstatus", createdBy: "Erstellt von", paidBy: "Kassiert von", workstation: "Arbeitsplatz", event: "Veranstaltung", customer: "Kunde", refundAmount: "Erstattungsbetrag", refundDate: "Bestätigte Erstattung", saleDate: "Verkaufsdatum" },
    fr: { title: "Historique des ventes", empty: "Aucune vente validée pour cet événement.", refresh: "Actualiser", loading: "Chargement des ventes…", previous: "Précédent", next: "Ventes suivantes", error: "Impossible de charger l’historique.", close: "Fermer le ticket", details: "Détails", original: "Montant original", preparation: "Statut de préparation", createdBy: "Créée par", paidBy: "Encaissée par", workstation: "Poste", event: "Événement", customer: "Client", refundAmount: "Montant du remboursement", refundDate: "Remboursement confirmé", saleDate: "Date de vente" },
    en: { title: "Sales history", empty: "No confirmed sales for this event.", refresh: "Refresh", loading: "Loading sales…", previous: "Previous", next: "More sales", error: "Unable to load sales history.", close: "Close receipt", details: "Details", original: "Original amount", preparation: "Preparation status", createdBy: "Created by", paidBy: "Collected by", workstation: "Workstation", event: "Event", customer: "Customer", refundAmount: "Refund amount", refundDate: "Refund confirmed", saleDate: "Sale date" },
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
  const shortDate = (value: string) => {
    const date = new Date(value);
    return `${date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })} · ${date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
  };
  const money = (value: number, currency: string) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(value / 100);
  const dayText = {
    fr: { today: "Aujourd’hui", yesterday: "Hier", sale: "vente", sales: "ventes", unknown: "Date indisponible", totals: "Totaux des ventes affichées sur cette page, avant remboursements." },
    de: { today: "Heute", yesterday: "Gestern", sale: "Verkauf", sales: "Verkäufe", unknown: "Datum nicht verfügbar", totals: "Summen der auf dieser Seite angezeigten Verkäufe vor Erstattungen." },
    en: { today: "Today", yesterday: "Yesterday", sale: "sale", sales: "sales", unknown: "Date unavailable", totals: "Totals for sales shown on this page, before refunds." },
  }[lang];
  const timeZone = "Europe/Berlin";
  const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const dayKey = (date: Date) => {
    if (Number.isNaN(date.getTime())) return "";
    const parts = dayFormatter.formatToParts(date);
    return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
  };
  const todayKey = dayKey(new Date());
  const yesterday = new Date(`${todayKey}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayKey = dayKey(yesterday);
  const days = new Map<string, OrderRow[]>();
  // Keep the API's order and group only the current pagination page.
  for (const order of current?.orders || []) {
    const key = dayKey(new Date(order.paid_at || order.created_at));
    const orders = days.get(key);
    if (orders) orders.push(order);
    else days.set(key, [order]);
  }
  const dayHeading = (key: string, orders: OrderRow[]) => {
    const date = key ? key.split("-").reverse().join(".") : dayText.unknown;
    const relative = key === todayKey ? `${dayText.today} · ` : key === yesterdayKey ? `${dayText.yesterday} · ` : "";
    const count = `${orders.length} ${orders.length === 1 ? dayText.sale : dayText.sales}`;
    const currency = (orders[0].currency || "eur").toUpperCase();
    const total = orders.reduce((sum, order) => sum + Number(order.amount_cents), 0);
    const canTotal = orders.every(order => Number.isSafeInteger(order.amount_cents) && (order.currency || "eur").toUpperCase() === currency)
      && Number.isSafeInteger(total) && /^[A-Z]{3}$/.test(currency);
    return `${relative}${date} · ${count}${canTotal ? ` · ${money(total, currency)}` : ""}`;
  };
  return <section className={styles.history} aria-label={text.title}>
    <h2>{text.title}</h2>
    <button type="button" className="af-link-btn" onClick={() => setRefreshKey((key) => key + 1)}>{text.refresh}</button>
    {error ? <p role="alert">{error}</p> : null}
    {!current && !error ? <p role="status">{text.loading}</p> : null}
    {current?.orders.length === 0 ? <p>{text.empty}</p> : null}
    {days.size > 0 ? <p className={dayStyles.note}>{dayText.totals}</p> : null}
    <div className={dayStyles.days}>
    {Array.from(days, ([key, orders]) => <section key={key} className={dayStyles.day} aria-label={dayHeading(key, orders)}>
      <h3 className={dayStyles.heading}>{dayHeading(key, orders)}</h3>
      {orders.map((order) => <article key={order.id} className={styles.historyCard}>
      <header className={styles.historyHeading}>
        <strong>{order.id}</strong>
        <time dateTime={order.paid_at || order.created_at} title={new Date(order.paid_at || order.created_at).toLocaleString(locale)}>{shortDate(order.paid_at || order.created_at)}</time>
      </header>
      <p className={styles.historyAmount}>
        {paymentLabels[lang][order.payment] || "—"} · {order.refund?.state === "refunded" ? `${text.original} : ` : ""}
        {Number.isSafeInteger(order.amount_cents) ? money(Number(order.amount_cents), order.currency || "eur") : "—"}
      </p>
      <RefundAction payment={order.payment} orderId={order.id} amountCents={order.amount_cents || 0} currency={order.currency || "eur"} eligible={order.can_refund === true} refund={order.refund} lang={lang} onRefresh={() => setRefreshKey((key) => key + 1)} />
      <div className={styles.historyTools}>
        <OnDemandOrderReceipt order={order} lang={lang} labels={labels[lang]} showEvent
          requested={selectedOrderId === order.id} onRequest={() => onSelect(order.id)} onPrint={() => window.print()} />
        {selectedOrderId === order.id ? <button type="button" className="af-link-btn" onClick={() => onSelect(null)}>{text.close}</button> : null}
      </div>
      <details className={styles.historyDetails}>
        <summary>{text.details}</summary>
        <ul>{order.items.map((item, index) => <li key={index}>{item.name} × {item.qty}</li>)}</ul>
        <dl className={styles.historyFacts}>
          <div><dt>{text.preparation}</dt><dd>{statusLabels[lang][order.status] || "—"}</dd></div>
          <div><dt>{text.saleDate}</dt><dd>{new Date(order.paid_at || order.created_at).toLocaleString(locale)}</dd></div>
          {order.customer_name ? <div><dt>{text.customer}</dt><dd>{order.customer_name}</dd></div> : null}
          <div><dt>{text.event}</dt><dd>{order.event_name || order.event_id || "—"}</dd></div>
          <div><dt>{text.createdBy}</dt><dd>{order.created_by_username || "—"} · {text.workstation} : {order.register_name || "—"}</dd></div>
          <div><dt>{text.paidBy}</dt><dd>{order.paid_by_username || "—"} · {text.workstation} : {order.paid_register_name || "—"}</dd></div>
          {order.refund ? <>
            <div><dt>{text.refundAmount}</dt><dd>{money(order.refund.amountCents, order.refund.currency)}</dd></div>
            {order.refund.state === "refunded" && order.refund.refundedAt ? <div><dt>{text.refundDate}</dt><dd>{new Date(order.refund.refundedAt).toLocaleString(locale)}</dd></div> : null}
          </> : null}
        </dl>
      </details>
    </article>)}
    </section>)}
    </div>
    <div className={styles.historyActions}>
      <button type="button" disabled={offset === 0} onClick={() => { onSelect(null); setOffset(Math.max(0, offset - PAGE_SIZE)); }}>{text.previous}</button>
      <button type="button" disabled={!current?.hasMore} onClick={() => { onSelect(null); setOffset(offset + PAGE_SIZE); }}>{text.next}</button>
    </div>
  </section>;
}
