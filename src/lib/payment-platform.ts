import type { Lang } from "@/lib/translations";

export type ClientPlatform = "ios" | "android" | "other";

export function detectClientPlatform(): ClientPlatform {
  if (typeof window === "undefined") return "other";
  const ua = String(window.navigator.userAgent || "");
  const lower = ua.toLowerCase();
  const maxTouchPoints = Number(window.navigator.maxTouchPoints || 0);
  const isIOS =
    /\b(iPhone|iPad|iPod)\b/i.test(ua) || (/\bMacintosh\b/i.test(ua) && maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (lower.includes("android")) return "android";
  return "other";
}

export function getCardPaymentHintText(lang: Lang, platform: ClientPlatform): string {
  if (platform === "ios") {
    if (lang === "fr") return "Paiement carte via Tap to Pay sur iPhone en caisse.";
    if (lang === "de") return "Kartenzahlung uber Tap to Pay auf dem iPhone an der Kasse.";
    return "Card payment via Tap to Pay on iPhone at cashier.";
  }
  if (platform === "android") {
    if (lang === "fr") return "Paiement carte sans contact (NFC) sur Android en caisse.";
    if (lang === "de") return "Kontaktlose Kartenzahlung (NFC) auf Android an der Kasse.";
    return "Contactless card payment (NFC) on Android at cashier.";
  }
  if (lang === "fr") return "Paiement carte sans contact en caisse.";
  if (lang === "de") return "Kontaktlose Kartenzahlung an der Kasse.";
  return "Contactless card payment at cashier.";
}

export function getCashierInitCardPaymentLabel(lang: Lang, platform: ClientPlatform): string {
  void platform;
  if (lang === "fr") return "Valider paiement carte";
  if (lang === "de") return "Kartenzahlung validieren";
  return "Validate card payment";
}

export function getCashierCreatingCardPaymentLabel(lang: Lang, platform: ClientPlatform): string {
  if (platform === "ios") {
    if (lang === "fr") return "Ouverture validation paiement...";
    if (lang === "de") return "Zahlungsvalidierung wird geoffnet...";
    return "Opening payment validation...";
  }
  if (platform === "android") {
    if (lang === "fr") return "Preparation paiement Android...";
    if (lang === "de") return "Android-Zahlung wird vorbereitet...";
    return "Preparing Android payment...";
  }
  if (lang === "fr") return "Preparation paiement carte...";
  if (lang === "de") return "Kartenzahlung wird vorbereitet...";
  return "Preparing card payment...";
}

export function getCashierWaitingWebhookText(lang: Lang, platform: ClientPlatform): string {
  if (platform === "ios") {
    if (lang === "fr") return "En attente de confirmation Tap to Pay sur iPhone (webhook Stripe)...";
    if (lang === "de") return "Warten auf Tap to Pay auf dem iPhone Bestatigung (Stripe Webhook)...";
    return "Waiting for Tap to Pay on iPhone confirmation (Stripe webhook)...";
  }
  if (platform === "android") {
    if (lang === "fr") return "En attente de confirmation paiement Android (webhook Stripe)...";
    if (lang === "de") return "Warten auf Android-Zahlungsbestatigung (Stripe Webhook)...";
    return "Waiting for Android payment confirmation (Stripe webhook)...";
  }
  if (lang === "fr") return "En attente de confirmation paiement carte (webhook Stripe)...";
  if (lang === "de") return "Warten auf Kartenzahlungsbestatigung (Stripe Webhook)...";
  return "Waiting for card payment confirmation (Stripe webhook)...";
}
