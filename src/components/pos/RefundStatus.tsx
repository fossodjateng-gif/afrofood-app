import type { OrderRow } from "@/lib/schema";
import type { Lang } from "@/lib/translations";
import styles from "./refund-status.module.css";

type Refund = Omit<NonNullable<OrderRow["refund"]>, "state"> & {
  state: NonNullable<OrderRow["refund"]>["state"] | "failed";
};
export function refundTone(refund?: Refund | null) {
  if (!refund) return "normal";
  return refund.state === "refunded" ? "refunded" : refund.state === "requires_review" ? "review" : "pending";
}

export function RefundStatus({ refund, payment, amountCents, currency = "eur", lang, validatedLabel, compact = false }: {
  refund?: Refund | null; payment: OrderRow["payment"]; amountCents?: number | null;
  currency?: string | null; lang: Lang; validatedLabel?: string; compact?: boolean;
}) {
  const tone = refundTone(refund);
  const text = {
    fr: { normal: "Validée", pending: "Remboursement en cours", review: "Vérification nécessaire", refunded: "REMBOURSÉE", original: "Montant original", cash: "remboursé en espèces", card: "remboursé sur carte" },
    de: { normal: "Validiert", pending: "Rückerstattung läuft", review: "Überprüfung erforderlich", refunded: "ERSTATTET", original: "Ursprünglicher Betrag", cash: "bar erstattet", card: "auf Karte erstattet" },
    en: { normal: "Validated", pending: "Refund in progress", review: "Review required", refunded: "REFUNDED", original: "Original amount", cash: "refunded in cash", card: "refunded to card" },
  }[lang];
  const money = (cents: number, code: string) => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : lang === "de" ? "de-DE" : "en-GB", { style: "currency", currency: code }).format(cents / 100);
  if (compact) {
    const compactText = {
      fr: { paid: "PAYÉE", requested: "Remboursement demandé", processing: "Remboursement en cours", failed: "Remboursement échoué", requires_review: "Vérification nécessaire", refunded: "REMBOURSÉE" },
      de: { paid: "BEZAHLT", requested: "Erstattung angefordert", processing: "Erstattung läuft", failed: "Erstattung fehlgeschlagen", requires_review: "Überprüfung erforderlich", refunded: "ERSTATTET" },
      en: { paid: "PAID", requested: "Refund requested", processing: "Refund in progress", failed: "Refund failed", requires_review: "Review required", refunded: "REFUNDED" },
    }[lang];
    const locale = lang === "fr" ? "fr-FR" : lang === "de" ? "de-DE" : "en-GB";
    const confirmedAt = refund?.state === "refunded" && refund.refundedAt ? new Date(refund.refundedAt) : null;
    return <div className={`${styles.status} ${styles.compact} ${styles[refund?.state === "failed" ? "review" : tone]}`} role="status" data-refund-state={refund?.state || "normal"}>
      <strong>{refund ? compactText[refund.state] : compactText.paid}</strong>
      {confirmedAt ? <> · <time dateTime={refund?.refundedAt || undefined} title={confirmedAt.toLocaleString(locale)}>
        {confirmedAt.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })} · {confirmedAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
      </time></> : null}
    </div>;
  }
  return <div className={`${styles.status} ${styles[tone]}`} role="status" data-refund-state={tone}>
    <strong>{tone === "normal" ? validatedLabel || text.normal : text[tone]}</strong>
    {tone === "refunded" && refund ? <span> — {money(refund.amountCents, refund.currency)} {refund.paymentMethod === "cash" || (!refund.paymentMethod && payment === "cash") ? text.cash : text.card}</span> : null}
    {refund && Number.isSafeInteger(amountCents) ? <div className={styles.original}>{text.original} : {money(Number(amountCents), currency || "eur")}</div> : null}
  </div>;
}
