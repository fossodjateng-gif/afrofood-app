import type { CardAttempt } from "@/lib/pos-card";
import type { OrderRow } from "@/lib/schema";
import { formatPosMoney } from "@/lib/pos-cart";
import { receiptActionLabels } from "@/components/OnDemandOrderReceipt";
import type { Lang } from "@/lib/translations";
import styles from "./pos.module.css";

export function CardPayment({ attempt, receipt, busy, error, delayed, onCheck, onResume, onNew, onTicket, lang }: {
  attempt: CardAttempt | null; receipt: OrderRow | null; busy: boolean; error: string | null; delayed: boolean;
  onCheck: () => void; onResume: () => void; onNew: () => void; onTicket: () => void; lang: Lang;
}) {
  return <section className={styles.cashPanel} aria-labelledby="card-title">
    <h2 id="card-title">{receipt ? "Zahlung erfolgreich" : attempt?.published ? "Auf Zahlung warten…" : "Kartenzahlung wird vorbereitet…"}</h2>
    {attempt?.orderId ? <p>Bestellnummer: <strong>{attempt.orderId}</strong></p> : null}
    {attempt?.orderId ? <div className={styles.total}><span>Total</span><strong>{formatPosMoney(attempt.amountCents)}</strong></div> : null}
    {attempt ? <p>{attempt.eventName} · Zahlungsart Karte</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {receipt ? <>
      <button className="af-btn" type="button" onClick={onNew}>Neue Bestellung</button>
      <button className={`af-link-btn ${styles.ticketButton}`} type="button" onClick={onTicket}>{receiptActionLabels[lang]}</button>
    </> : <>
      {attempt?.published ? <p>Bestellung auf dem iPhone verfügbar</p> : null}
      <p role="status">{delayed || error ? "Zahlung wird noch geprüft. Bitte nicht erneut bezahlen." : "Bitte die Zahlung auf dem AfroFood Terminal iPhone durchführen."}</p>
      {attempt?.orderId ? <button className="af-link-btn" type="button" disabled={busy} onClick={onCheck}>Status erneut prüfen</button> : null}
      {attempt && !attempt.published ? <button className="af-btn" type="button" disabled={busy} onClick={onResume}>Dieselbe Zahlung fortsetzen</button> : null}
      <p>Eine sichere Stornierung ist hier noch nicht verfügbar. Bei Unsicherheit dieselbe Bestellung prüfen.</p>
    </>}
  </section>;
}
