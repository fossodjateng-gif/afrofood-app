"use client";
import { useRef, useState } from "react";
import { getSession, staffFetch } from "@/lib/staff-auth";
import { RefundStatus } from "@/components/pos/RefundStatus";
import type { Lang } from "@/lib/translations";
import styles from "./pos.module.css";

export type PublicRefund = { state: "requested" | "processing" | "refunded" | "requires_review" | "failed"; amountCents: number; currency: string; refundedAt: string | null; paymentMethod?: "card" | "cash" };
export function RefundAction({ orderId, amountCents, currency, eligible, refund, payment = "card", lang, onRefresh }: {
  orderId: string; amountCents: number; currency: string; eligible: boolean; payment?: "card" | "cash" | "cashless"; refund?: PublicRefund | null; lang: Lang; onRefresh: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<PublicRefund | null>(null);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const text = {
    de: { action: "Gesamten Betrag erstatten", confirm: "Gesamten Betrag erstatten", cancel: "Zurück", warning: "Der gesamte Betrag wird auf das ursprüngliche Zahlungsmittel zurückerstattet.", pending: "Keine neue Rückerstattung starten. Dieselbe Rückerstattung prüfen.", check: "Rückerstattung prüfen", retry: "Dieselbe Rückerstattung fortsetzen", error: "Ergebnis unklar. Bitte dieselbe Rückerstattung prüfen." },
    fr: { action: "Rembourser intégralement", confirm: "Rembourser le montant total", cancel: "Retour", warning: "Le montant total sera remboursé sur le moyen de paiement d’origine.", pending: "Ne lancez pas un nouveau remboursement. Vérifiez le même remboursement.", check: "Vérifier le remboursement", retry: "Reprendre le même remboursement", error: "Résultat incertain. Vérifiez le même remboursement." },
    en: { action: "Refund full amount", confirm: "Refund full amount", cancel: "Back", warning: "The full amount will be refunded to the original payment method.", pending: "Do not start a new refund. Check the same refund.", check: "Check refund", retry: "Resume the same refund", error: "Result uncertain. Check the same refund." },
  }[lang];
  const value = current?.state === "refunded" ? current : refund?.state === "refunded" ? refund : current || refund;
  const locale = lang === "de" ? "de-DE" : lang === "fr" ? "fr-FR" : "en-GB";
  const money = (amount: number, code: string) => new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(amount / 100);
  const cash = (value?.paymentMethod || payment) === "cash";
  const cashText = {
    fr: { paid: "Espèces · Payé", balance: "Montant payé en espèces", warning: "Remettez le montant total en espèces au client une seule fois. Cette confirmation enregistre la restitution dans AfroFood, sans virement automatique." },
    de: { paid: "Barzahlung · Bezahlt", balance: "Bar bezahlter Betrag", warning: "Geben Sie dem Kunden den gesamten Betrag einmalig in bar zurück. Diese Bestätigung erfasst die Rückgabe in AfroFood; es erfolgt keine automatische Auszahlung." },
    en: { paid: "Cash · Paid", balance: "Amount paid in cash", warning: "Return the full amount to the customer in cash once. This confirmation records the cash return in AfroFood; no automatic transfer takes place." },
  }[lang];
  async function request(create: boolean) {
    if (inFlight.current || (create && !eligible)) return;
    inFlight.current = true;
    setBusy(true);setError(false);
    try {
      const response = await staffFetch(`/api/orders/${encodeURIComponent(orderId)}/refund`, {
        method: create ? "POST" : "GET", cache: "no-store",
        headers: { "x-staff-user-id": getSession()?.userId || "", ...(create ? { "Content-Type": "application/json" } : {}) },
        ...(create ? { body: JSON.stringify({ amountCents }) } : {}),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("Refund unavailable");
      setCurrent(data.refund || null);setConfirm(false);onRefresh();
    } catch { setError(true);setConfirm(false); }
    finally { inFlight.current = false;setBusy(false); }
  }
  if (!eligible && !value) return <RefundStatus payment={payment} lang={lang} compact />;
  return <div className={styles.historyRefund}>
    <RefundStatus refund={value} payment={payment} lang={lang} compact />
    {value ? <>
      {value.state === "requested" || value.state === "processing" ? <p className={styles.historyHint}>{text.pending}</p> : null}
      <div className={styles.historyActions}>
        {value.state !== "refunded" ? <button type="button" className="af-link-btn" disabled={busy} onClick={() => void request(false)}>{text.check}</button> : null}
        {value.state === "requested" && eligible ? <button type="button" className="af-link-btn" disabled={busy} onClick={() => setConfirm(true)}>{text.retry}</button> : null}
      </div>
    </> : <button type="button" className="af-link-btn" disabled={busy} onClick={() => setConfirm(true)}>{text.action}</button>}
    {error ? <p className="af-message af-message-error" role="alert">{text.error} {!value || value.state === "refunded" ? <button type="button" disabled={busy} onClick={() => void request(false)}>{text.check}</button> : null}</p> : null}
    {confirm && eligible ? <section className={`af-panel ${styles.historyConfirmation}`} role="dialog" aria-modal="false" aria-label={text.action}>
      <strong>{orderId} · {money(amountCents, currency)}</strong>
      <p>{cash ? cashText.warning : text.warning}</p>
      <button type="button" className="af-danger" disabled={busy} onClick={() => void request(true)}>{text.confirm}</button>
      <button type="button" disabled={busy} onClick={() => setConfirm(false)}>{text.cancel}</button>
    </section> : null}
  </div>;
}
