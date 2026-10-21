"use client";
import { useRef, useState } from "react";
import { getSession } from "@/lib/staff-auth";
import type { Lang } from "@/lib/translations";

export type PublicRefund = { state: "requested" | "processing" | "refunded" | "requires_review"; amountCents: number; currency: string; refundedAt: string | null };
export function RefundAction({ orderId, amountCents, currency, eligible, refund, lang, onRefresh }: {
  orderId: string; amountCents: number; currency: string; eligible: boolean; refund?: PublicRefund | null; lang: Lang; onRefresh: () => void;
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
  async function request(create: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);setError(false);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/refund`, {
        method: create ? "POST" : "GET", cache: "no-store",
        headers: { "x-staff-user-id": getSession()?.userId || "" },
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("Refund unavailable");
      setCurrent(data.refund || null);setConfirm(false);onRefresh();
    } catch { setError(true);setConfirm(false); }
    finally { inFlight.current = false;setBusy(false); }
  }
  if (!eligible && !value) return null;
  return <div style={{ marginTop: 12, overflowWrap: "anywhere" }}>
    {value ? <>
      <p role="status">{value.state === "refunded" ? text.refunded : value.state === "requires_review" ? text.review : text.pending}</p>
      <p>{money(value.amountCents, value.currency)}{value.refundedAt ? ` · ${new Date(value.refundedAt).toLocaleString(locale)}` : ""}</p>
      {value.state !== "refunded" ? <button type="button" className="af-link-btn" disabled={busy} onClick={() => void request(false)}>{text.check}</button> : null}
      {value.state === "requested" ? <button type="button" className="af-link-btn" disabled={busy} onClick={() => setConfirm(true)}>{text.retry}</button> : null}
    </> : <>
      <p>{text.paid}</p>
      <button type="button" className="af-link-btn" disabled={busy} onClick={() => setConfirm(true)}>{text.action}</button>
    </>}
    {error ? <p role="alert">{text.error} <button type="button" disabled={busy} onClick={() => void request(false)}>{text.check}</button></p> : null}
    {confirm ? <section role="dialog" aria-modal="false" aria-label={text.action} style={{ border: "1px solid var(--af-border)", padding: 16, marginTop: 12 }}>
      <strong>{orderId} · {money(amountCents, currency)}</strong>
      <p>{text.warning}</p>
      <button type="button" disabled={busy} onClick={() => void request(true)}>{text.confirm}</button>
      <button type="button" disabled={busy} onClick={() => setConfirm(false)}>{text.cancel}</button>
    </section> : null}
  </div>;
}
