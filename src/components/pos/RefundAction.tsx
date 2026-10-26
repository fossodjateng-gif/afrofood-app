"use client";
import { useRef, useState } from "react";
import { getSession, staffFetch } from "@/lib/staff-auth";
import { RefundStatus } from "@/components/pos/RefundStatus";
import type { Lang } from "@/lib/translations";

export type PublicRefund = { state: "requested" | "processing" | "refunded" | "requires_review"; amountCents: number; currency: string; refundedAt: string | null; paymentMethod?: "card" | "cash" };
export function RefundAction({ orderId, amountCents, currency, eligible, refund, payment = "card", lang, onRefresh }: {
  orderId: string; amountCents: number; currency: string; eligible: boolean; payment?: "card" | "cash" | "cashless"; refund?: PublicRefund | null; lang: Lang; onRefresh: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<PublicRefund | null>(null);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const text = {
    de: { paid: "Kartenzahlung · Bezahlt", action: "Rückerstattung", confirm: "Gesamten Betrag erstatten", cancel: "Zurück", warning: "Der Betrag wird auf das ursprüngliche Zahlungsmittel zurückerstattet.", refunded: "Erstattet", pending: "Rückerstattung wird geprüft. Keine neue Rückerstattung starten.", review: "Überprüfung erforderlich", check: "Rückerstattung prüfen", retry: "Dieselbe Rückerstattung fortsetzen", error: "Ergebnis unklar. Bitte dieselbe Rückerstattung prüfen." },
    fr: { paid: "Carte · Payé", action: "Remboursement", confirm: "Rembourser le montant total", cancel: "Retour", warning: "Le montant sera remboursé sur le moyen de paiement d’origine.", refunded: "Remboursé", pending: "Remboursement en cours de vérification. Ne lancez pas un nouveau remboursement.", review: "Vérification nécessaire", check: "Vérifier le remboursement", retry: "Reprendre le même remboursement", error: "Résultat incertain. Vérifiez le même remboursement." },
    en: { paid: "Card · Paid", action: "Refund", confirm: "Refund full amount", cancel: "Back", warning: "The amount will be refunded to the original payment method.", refunded: "Refunded", pending: "Refund being checked. Do not start a new refund.", review: "Review required", check: "Check refund", retry: "Resume the same refund", error: "Result uncertain. Check the same refund." },
  }[lang];
  const value = current?.state === "refunded" ? current : refund?.state === "refunded" ? refund : current || refund;
  const locale = lang === "de" ? "de-DE" : lang === "fr" ? "fr-FR" : "en-GB";
  const money = (amount: number, code: string) => new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(amount / 100);
  const balances = {
    de: { paid: "Karte bezahlt", refunded: "Bereits erstattet", remaining: "Noch erstattbar", unknown: "Zu prüfen", requested: "Anfrage gespeichert · Verarbeitung ausstehend" },
    fr: { paid: "Montant payé carte", refunded: "Déjà remboursé", remaining: "Encore remboursable", unknown: "À vérifier", requested: "Demande enregistrée · En attente de traitement" },
    en: { paid: "Card amount paid", refunded: "Already refunded", remaining: "Still refundable", unknown: "Needs verification", requested: "Request recorded · Awaiting processing" },
  }[lang];
  const cash = (value?.paymentMethod || payment) === "cash";
  const cashText = {
    fr: { paid: "Espèces · Payé", balance: "Montant payé en espèces", warning: "Remettez le montant total en espèces au client une seule fois. Cette confirmation enregistre la restitution dans AfroFood, sans virement automatique." },
    de: { paid: "Barzahlung · Bezahlt", balance: "Bar bezahlter Betrag", warning: "Geben Sie dem Kunden den gesamten Betrag einmalig in bar zurück. Diese Bestätigung erfasst die Rückgabe in AfroFood; es erfolgt keine automatische Auszahlung." },
    en: { paid: "Cash · Paid", balance: "Amount paid in cash", warning: "Return the full amount to the customer in cash once. This confirmation records the cash return in AfroFood; no automatic transfer takes place." },
  }[lang];
  const refundedCents = value?.state === "refunded" ? value.amountCents : 0;
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
  if (!eligible && !value) return null;
  return <div className="af-panel" style={{ marginTop: 12, overflowWrap: "anywhere" }}>
    <p>{orderId}</p>
    {value ? <RefundStatus refund={value} payment={payment} amountCents={amountCents} currency={currency} lang={lang} /> : null}
    <dl>
      <dt>{cash ? cashText.balance : balances.paid}</dt><dd>{money(amountCents, currency)}</dd>
      <dt>{balances.refunded}</dt><dd>{value?.state === "requires_review" ? balances.unknown : money(refundedCents, currency)}</dd>
      <dt>{balances.remaining}</dt><dd>{value?.state === "requires_review" ? balances.unknown : money(Math.max(0, amountCents - refundedCents), currency)}</dd>
    </dl>
    {value ? <>
      <p className={`af-message ${value.state === "refunded" ? "af-message-success" : "af-message-warning"}`} role="status">{value.state === "refunded" ? text.refunded : value.state === "requires_review" ? text.review : value.state === "requested" ? balances.requested : text.pending}</p>
      <p>{money(value.amountCents, value.currency)}{value.refundedAt ? ` · ${new Date(value.refundedAt).toLocaleString(locale)}` : ""}</p>
      {value.state !== "refunded" ? <button type="button" className="af-link-btn" disabled={busy} onClick={() => void request(false)}>{text.check}</button> : null}
      {value.state === "requested" && eligible ? <button type="button" className="af-link-btn" disabled={busy} onClick={() => setConfirm(true)}>{text.retry}</button> : null}
    </> : <>
      <p>{cash ? cashText.paid : text.paid}</p>
      <button type="button" className="af-link-btn" disabled={busy} onClick={() => setConfirm(true)}>{text.action}</button>
    </>}
    {error ? <p className="af-message af-message-error" role="alert">{text.error} <button type="button" disabled={busy} onClick={() => void request(false)}>{text.check}</button></p> : null}
    {confirm && eligible ? <section className="af-panel" role="dialog" aria-modal="false" aria-label={text.action} style={{ border: "1px solid var(--af-border)", padding: 16, marginTop: 12 }}>
      <strong>{orderId} · {money(amountCents, currency)}</strong>
      <p>{cash ? cashText.warning : text.warning}</p>
      <button type="button" className="af-danger" disabled={busy} onClick={() => void request(true)}>{text.confirm}</button>
      <button type="button" disabled={busy} onClick={() => setConfirm(false)}>{text.cancel}</button>
    </section> : null}
  </div>;
}
