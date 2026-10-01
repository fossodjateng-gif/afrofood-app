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
    if (lang === "fr") return "Paiement carte en caisse sur le terminal AfroFood.";
    if (lang === "de") return "Kartenzahlung an der Kasse auf dem AfroFood-Terminal.";
    return "Card payment at cashier on the AfroFood terminal.";
  }
  if (platform === "android") {
    if (lang === "fr") return "Paiement carte en caisse sur le terminal AfroFood.";
    if (lang === "de") return "Kartenzahlung an der Kasse auf dem AfroFood-Terminal.";
    return "Card payment at cashier on the AfroFood terminal.";
  }
  if (lang === "fr") return "Paiement carte en caisse sur le terminal AfroFood.";
  if (lang === "de") return "Kartenzahlung an der Kasse auf dem AfroFood-Terminal.";
  return "Card payment at cashier on the AfroFood terminal.";
}

export function getCashierInitCardPaymentLabel(lang: Lang, platform: ClientPlatform): string {
  if (platform === "ios") {
    if (lang === "fr") return "Demarrer Tap to Pay sur iPhone";
    if (lang === "de") return "Tap to Pay auf dem iPhone starten";
    return "Start Tap to Pay on iPhone";
  }
  if (platform === "android") {
    if (lang === "fr") return "Demarrer Tap to Pay sur iPhone";
    if (lang === "de") return "Tap to Pay auf dem iPhone starten";
    return "Start Tap to Pay on iPhone";
  }
  if (lang === "fr") return "Demarrer Tap to Pay sur iPhone";
  if (lang === "de") return "Tap to Pay auf dem iPhone starten";
  return "Start Tap to Pay on iPhone";
}

export function getCashierCreatingCardPaymentLabel(lang: Lang, platform: ClientPlatform): string {
  if (platform === "ios") {
    if (lang === "fr") return "Preparation Tap to Pay sur iPhone...";
    if (lang === "de") return "Tap to Pay auf dem iPhone wird vorbereitet...";
    return "Preparing Tap to Pay on iPhone...";
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
