import { formatPosMoney } from "@/lib/pos-cart";
import { parseReceivedCents, quickCashAmounts, type CashReceipt } from "@/lib/pos-cash";
import styles from "./pos.module.css";
import { receiptActionLabels } from "@/components/OnDemandOrderReceipt";
import type { Lang } from "@/lib/translations";

export function CashPayment({ totalCents, received, busy, error, receipt, locked, onReceived, onConfirm, onClose, onNew, onTicket, lang = "de" }: {
  lang?: Lang;
  totalCents: number; received: string; busy: boolean; error: string | null; receipt: CashReceipt | null; locked: boolean;
  onReceived: (value: string) => void; onConfirm: () => void; onClose: () => void; onNew: () => void; onTicket: () => void;
}) {
  const cents = parseReceivedCents(received);
  const change = cents === null ? null : cents - totalCents;
  return <section className={styles.cashPanel} aria-labelledby="cash-title">
    <h2 id="cash-title">{receipt ? "Barzahlung erfolgreich" : "Barzahlung"}</h2>
    {receipt ? <>
      <p>Bestellnummer: <strong>{receipt.id}</strong></p>
      <div className={styles.total}><span>Total</span><strong>{formatPosMoney(receipt.amount_cents)}</strong></div>
      <p>Erhalten: <strong>{formatPosMoney(receipt.cash_received_cents)}</strong></p>
      <div className={styles.change}><span>Rückgeld</span><strong>{formatPosMoney(receipt.change_given_cents)}</strong></div>
      <button className="af-btn" type="button" onClick={onNew}>Neue Bestellung</button>
      <button className={`af-link-btn ${styles.ticketButton}`} type="button" onClick={onTicket}>{receiptActionLabels[lang]}</button>
    </> : <>
      <div className={styles.total}><span>Total / Zu zahlen</span><strong>{formatPosMoney(totalCents)}</strong></div>
      <label htmlFor="cash-received">Erhaltener Betrag (€)</label>
      <input id="cash-received" inputMode="decimal" autoComplete="off" value={received} disabled={busy} onChange={(event) => onReceived(event.target.value)} />
      <div className={styles.cashQuick}>{quickCashAmounts(totalCents).map((amount) => <button key={amount} className="af-btn" type="button" disabled={busy} onClick={() => onReceived((amount / 100).toFixed(2))}>{amount === totalCents ? "Passend" : formatPosMoney(amount)}</button>)}</div>
      <div className={styles.change} aria-live="polite"><span>Rückgeld</span><strong>{change !== null && change >= 0 ? formatPosMoney(change) : "—"}</strong></div>
      {change !== null && change < 0 ? <p>Der erhaltene Betrag ist zu niedrig.</p> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <button className="af-btn" type="button" disabled={busy || cents === null || change === null || change < 0} onClick={onConfirm}>{busy ? "Barzahlung wird bestätigt…" : "Barzahlung bestätigen"}</button>
      {!locked ? <button className="af-link-btn" type="button" disabled={busy} onClick={onClose}>Zurück zum Warenkorb</button> : <p>Diese Zahlung ist gespeichert. Bei einem Fehler dieselbe Zahlung erneut bestätigen.</p>}
    </>}
  </section>;
}
