import type { CardAttempt } from "@/lib/pos-card";
import { isCanceledCardOrder } from "@/lib/pos-card";
import type { OrderRow } from "@/lib/schema";
import { formatPosMoney } from "@/lib/pos-cart";
import { receiptActionLabels } from "@/components/OnDemandOrderReceipt";
import type { Lang } from "@/lib/translations";
import { getPaymentErrorMessage, paymentPresentation } from "@/components/pos/payment-presentation";
import styles from "./pos.module.css";

export function CardPayment({ attempt, order, receipt, busy, error, delayed, onCheck, onResume, onNew, onTicket, onCancel, lang }: {
  order?: OrderRow | null; onCancel?: () => void;
  attempt: CardAttempt | null; receipt: OrderRow | null; busy: boolean; error: string | null; delayed: boolean;
  onCheck: () => void; onResume: () => void; onNew: () => void; onTicket: () => void; lang: Lang;
}) {
  const canceled = !!attempt && isCanceledCardOrder(order || null, attempt);
  const canceling = !!attempt?.cancelRequested || order?.pos_card_state === "cancel_requested";
  const requiresReview = attempt?.cancellationOutcome === "requires_review";
  const paymentText = paymentPresentation[lang];
  const cancelText = {
    de: { action: "Kartenzahlung stornieren", pending: "Stornierung der Zahlung läuft", check: "Stornierung erneut prüfen", done: "Kartenzahlung storniert", next: "Neue Bestellung", hint: "Keine neue Zahlung starten. Dieselbe Stornierung erneut prüfen." },
    fr: { action: "Annuler le paiement carte", pending: "Annulation du paiement en cours", check: "Vérifier à nouveau l’annulation", done: "Paiement carte annulé", next: "Nouvelle commande", hint: "Ne lancez aucun nouveau paiement. Vérifiez la même annulation." },
    en: { action: "Cancel card payment", pending: "Payment cancellation in progress", check: "Check cancellation again", done: "Card payment canceled", next: "New order", hint: "Do not start a new payment. Check the same cancellation again." },
  }[lang];
  return <section className={styles.cashPanel} aria-labelledby="card-title">
    <h2 id="card-title">{receipt ? paymentText.success : canceled ? cancelText.done : requiresReview ? paymentText.review : canceling ? cancelText.pending : attempt?.published ? "Auf Zahlung warten…" : "Kartenzahlung wird vorbereitet…"}</h2>
    {!receipt && !canceled && requiresReview ? <p role="alert" className={styles.error}>{paymentText.reviewHint}</p> : null}
    {attempt?.orderId ? <p>Bestellnummer: <strong>{attempt.orderId}</strong></p> : null}
    {attempt?.orderId ? <div className={styles.total}><span>Total</span><strong>{formatPosMoney(attempt.amountCents)}</strong></div> : null}
    {attempt ? <p>{attempt.eventName} · Zahlungsart Karte</p> : null}
    {error ? <p role="alert" className={styles.error}>{getPaymentErrorMessage(error, lang)}</p> : null}
    {receipt ? <>
      <button className="af-btn" type="button" onClick={onNew}>Neue Bestellung</button>
      <button className={`af-link-btn ${styles.ticketButton}`} type="button" onClick={onTicket}>{receiptActionLabels[lang]}</button>
    </> : canceled ? <button className="af-btn" type="button" disabled={busy} onClick={onNew}>{cancelText.next}</button> : canceling ? <>
      <p role="status">{requiresReview ? paymentText.review : cancelText.pending}</p>
      <p>{cancelText.hint}</p>
      <button className="af-btn" type="button" disabled={busy} onClick={onCancel}>{cancelText.check}</button>
    </> : <>
      {attempt?.published ? <p>Bestellung auf dem iPhone verfügbar</p> : null}
      <p role="status">{delayed || error ? "Zahlung wird noch geprüft. Bitte nicht erneut bezahlen." : "Bitte die Zahlung auf dem AfroFood Terminal iPhone durchführen."}</p>
      {attempt?.orderId ? <button className="af-link-btn" type="button" disabled={busy} onClick={onCheck}>Status erneut prüfen</button> : null}
      {attempt && !attempt.published ? <button className="af-btn" type="button" disabled={busy} onClick={onResume}>Dieselbe Zahlung fortsetzen</button> : null}
      {attempt?.orderId && order?.status === "PENDING_PAYMENT" && order.pos_card_state === "ready" ? <button className="af-link-btn" type="button" disabled={busy} onClick={onCancel}>{cancelText.action}</button> : null}
    </>}
  </section>;
}
