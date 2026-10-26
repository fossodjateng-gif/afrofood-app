import type { OrderRow } from "@/lib/schema";
import type { Lang } from "@/lib/translations";
import styles from "./refund-status.module.css";

type Refund = NonNullable<OrderRow["refund"]>;
export function refundTone(refund?: Refund | null) {
  if (!refund) return "normal";
  return refund.state === "refunded" ? "refunded" : refund.state === "requires_review" ? "review" : "pending";
}

export function RefundStatus({ refund, payment, amountCents, currency = "eur", lang, validatedLabel }: {
  refund?: Refund | null; payment: OrderRow["payment"]; amountCents?: number | null;
  currency?: string | null; lang: Lang; validatedLabel?: string;
}) {
  const tone = refundTone(refund);
  const text = {
    fr: { normal: "Validée", pending: "Remboursement en cours", review: "Vérification nécessaire", refunded: "REMBOURSÉE", original: "Montant original", cash: "remboursé en espèces", card: "remboursé sur carte" },
    de: { normal: "Validiert", pending: "Rückerstattung läuft", review: "Überprüfung erforderlich", refunded: "ERSTATTET", original: "Ursprünglicher Betrag", cash: "bar erstattet", card: "auf Karte erstattet" },
    en: { normal: "Validated", pending: "Refund in progress", review: "Review required", refunded: "REFUNDED", original: "Original amount", cash: "refunded in cash", card: "refunded to card" },
  }[lang];
  const money = (cents: number, code: string) => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : lang === "de" ? "de-DE" : "en-GB", { style: "currency", currency: code }).format(cents / 100);
  return <div className={`${styles.status} ${styles[tone]}`} role="status" data-refund-state={tone}>
    <strong>{tone === "normal" ? validatedLabel || text.normal : text[tone]}</strong>
    {tone === "refunded" && refund ? <span> — {money(refund.amountCents, refund.currency)} {refund.paymentMethod === "cash" || (!refund.paymentMethod && payment === "cash") ? text.cash : text.card}</span> : null}
    {refund && Number.isSafeInteger(amountCents) ? <div className={styles.original}>{text.original} : {money(Number(amountCents), currency || "eur")}</div> : null}
  </div>;
}
