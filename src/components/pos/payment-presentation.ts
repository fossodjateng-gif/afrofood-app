import type { Lang } from "@/lib/translations";

// Presentation only: keep the original errors and payment state untouched.
export const paymentPresentation = {
  de: {
    success: "Zahlung erfolgreich",
    review: "Überprüfung erforderlich",
    reviewHint: "Keine neue Kartenzahlung starten.",
    waiting: "Warten auf Zahlungsbestätigung. Bitte keine neue Kartenzahlung starten.",
    context: "Diese Zahlung gehört zu einem anderen Kassenkontext. Bitte in der ursprünglichen Kasse prüfen. Keine neue Kartenzahlung starten.",
    notCancelable: "Die Zahlung kann derzeit nicht storniert werden. Bitte den Zahlungsstatus prüfen. Keine neue Kartenzahlung starten.",
    cancellation: "Die Stornierung konnte nicht bestätigt werden. Bitte dieselbe Stornierung erneut prüfen. Keine neue Kartenzahlung starten.",
    unknown: "Die Aktion konnte nicht bestätigt werden. Bitte den Zahlungsstatus prüfen. Keine neue Kartenzahlung starten.",
  },
  fr: {
    success: "Paiement réussi",
    review: "Vérification nécessaire",
    reviewHint: "Ne lancez pas un nouveau paiement par carte.",
    waiting: "En attente de confirmation du paiement. Ne lancez pas un nouveau paiement par carte.",
    context: "Ce paiement appartient à un autre contexte de caisse. Vérifiez-le dans la caisse d’origine. Ne lancez pas un nouveau paiement par carte.",
    notCancelable: "Ce paiement ne peut pas être annulé pour le moment. Vérifiez son statut. Ne lancez pas un nouveau paiement par carte.",
    cancellation: "L’annulation n’a pas pu être confirmée. Vérifiez à nouveau la même annulation. Ne lancez pas un nouveau paiement par carte.",
    unknown: "L’action n’a pas pu être confirmée. Vérifiez le statut du paiement. Ne lancez pas un nouveau paiement par carte.",
  },
  en: {
    success: "Payment successful",
    review: "Review required",
    reviewHint: "Do not start a new card payment.",
    waiting: "Waiting for payment confirmation. Do not start a new card payment.",
    context: "This payment belongs to another cashier context. Check it at the original cashier. Do not start a new card payment.",
    notCancelable: "This payment cannot be canceled right now. Check its status. Do not start a new card payment.",
    cancellation: "Cancellation could not be confirmed. Check the same cancellation again. Do not start a new card payment.",
    unknown: "The action could not be confirmed. Check the payment status. Do not start a new card payment.",
  },
};

export function getPaymentErrorMessage(message: string, lang: Lang): string {
  const text = paymentPresentation[lang];
  switch (message.trim()) {
    case "context_mismatch": return text.context;
    case "order_not_cancelable": return text.notCancelable;
    case "cancellation_unavailable": return text.cancellation;
    case "requires_review": return `${text.review}. ${text.reviewHint}`;
    default: return text.unknown;
  }
}

export function getCashierLogMessage(message: string, lang: Lang): string {
  return /PaymentIntent|\bPI=|webhook\s+Stripe|Stripe\s+webhook|context_mismatch|order_not_cancelable|cancellation_unavailable/i.test(message)
    ? paymentPresentation[lang].waiting
    : message;
}
