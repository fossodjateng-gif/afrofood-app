"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrderRow } from "@/lib/schema";
import { QRCodeCanvas } from "qrcode.react";
import { makeQrPayload } from "@/lib/order";
import { subscribeOrderSync } from "@/lib/order-sync";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { clearSession, getSession, getStaffRoleLabel, type StaffRole } from "@/lib/staff-auth";
import { goBackOr } from "@/lib/client-nav";
import {
  detectClientPlatform,
  getCashierCreatingCardPaymentLabel,
  getCashierInitCardPaymentLabel,
  getCashierWaitingWebhookText,
  type ClientPlatform,
} from "@/lib/payment-platform";

const CASHIER_PIN = process.env.NEXT_PUBLIC_CAISSE_PIN || "1955";

type CaisseCard = OrderRow & { isJustValidated?: boolean };

const UI_TEXT: Record<
  Lang,
  {
    unknownError: string;
    validatePaymentError: string;
    back: string;
    logout: string;
    lockTitle: string;
    lockSubtitle: string;
    pinPlaceholder: string;
    pinWrong: string;
    validate: string;
    title: string;
    subtitle: string;
    refreshing: string;
    refreshed: string;
    refresh: string;
    loading: string;
    noOrders: string;
    name: string;
    payment: string;
    validating: string;
    validatePayment: string;
    initTapToPay: string;
    creatingTapToPay: string;
    tapToPayReady: string;
    tapToPayStatus: string;
    waitStripeValidation: string;
    piPlaceholder: string;
    confirmPi: string;
    confirmingPi: string;
    validated: string;
    total: string;
    ticketTitle: string;
    ticketSub: string;
    order: string;
    ticketSent: string;
    thanks: string;
    reprint: string;
    actionLogTitle: string;
    noRecentActions: string;
    cancelOrder: string;
    canceling: string;
    canceled: string;
    ticketLegend: string;
    quickAccess: string;
    qaKitchenSpace: string;
    qaPayments: string;
    qaEvent: string;
  }
> = {
  de: {
    unknownError: "Unbekannter Fehler",
    validatePaymentError: "Fehler bei der Zahlungsfreigabe",
    back: "Zuruck",
    logout: "Abmelden",
    lockTitle: "Geschutzte Kasse",
    lockSubtitle: "4-stelligen Code eingeben",
    pinPlaceholder: "PIN Code",
    pinWrong: "Falscher Code",
    validate: "Bestatigen",
    title: "Kasse - Zahlungsfreigabe",
    subtitle: "Manuelle Freigabe und Weiterleitung an die Kuche",
    refreshing: "Aktualisierung...",
    refreshed: "Aktualisiert",
    refresh: "Aktualisieren",
    loading: "Laden...",
    noOrders: "Keine Bestellung.",
    name: "Name",
    payment: "Zahlung",
    validating: "Validierung...",
    validatePayment: "Barzahlung bestaetigen",
    initTapToPay: "Tap to Pay auf dem iPhone",
    creatingTapToPay: "Tap to Pay startet...",
    tapToPayReady: "PaymentIntent erstellt",
    tapToPayStatus: "Stripe Status",
    waitStripeValidation: "Warten auf Stripe Webhook (payment_intent.succeeded)...",
    piPlaceholder: "PaymentIntent ID (pi_...)",
    confirmPi: "Kartenzahlung per PI bestaetigen",
    confirmingPi: "PI wird gepruft...",
    validated: "Validiert",
    total: "Gesamt",
    ticketTitle: "Kundenbeleg",
    ticketSub: "Ausgestellt nach Zahlungsfreigabe",
    order: "Bestellung",
    ticketSent: "Bestellung an die Kuche gesendet",
    thanks: "Danke und guten Appetit",
    reprint: "Beleg erneut drucken",
    actionLogTitle: "Kassenjournal",
    noRecentActions: "Keine aktuellen Aktionen.",
    cancelOrder: "Bestellung stornieren",
    canceling: "Storniere...",
    canceled: "Storniert",
    ticketLegend: "(1) Enthalt Gluten - (2) Enthalt Sellerie",
    quickAccess: "Schnellzugriff",
    qaKitchenSpace: "Kuchenbereich",
    qaPayments: "Zahlungen",
    qaEvent: "Event / Markt",
  },
  fr: {
    unknownError: "Erreur inconnue",
    validatePaymentError: "Erreur pendant la validation du paiement",
    back: "Retour",
    logout: "Se deconnecter",
    lockTitle: "Caisse securisee",
    lockSubtitle: "Entrer le code a 4 chiffres",
    pinPlaceholder: "Code PIN",
    pinWrong: "Code incorrect",
    validate: "Valider",
    title: "Caisse - Validation Paiement",
    subtitle: "Validation manuelle puis envoi cuisine",
    refreshing: "Actualisation...",
    refreshed: "Actualise",
    refresh: "Actualiser",
    loading: "Chargement...",
    noOrders: "Aucune commande.",
    name: "Nom",
    payment: "Paiement",
    validating: "Validation...",
    validatePayment: "Confirmer paiement espece",
    initTapToPay: "Tap to Pay sur iPhone",
    creatingTapToPay: "Demarrage Tap to Pay...",
    tapToPayReady: "PaymentIntent cree",
    tapToPayStatus: "Statut Stripe",
    waitStripeValidation: "En attente du webhook Stripe (payment_intent.succeeded)...",
    piPlaceholder: "PaymentIntent ID (pi_...)",
    confirmPi: "Confirmer paiement carte via PI",
    confirmingPi: "Verification PI...",
    validated: "Validee",
    total: "Total",
    ticketTitle: "Ticket Client",
    ticketSub: "Emis apres validation paiement",
    order: "Commande",
    ticketSent: "Commande envoyee en cuisine",
    thanks: "Merci et bon appetit",
    reprint: "Reimprimer ticket",
    actionLogTitle: "Journal actions caisse",
    noRecentActions: "Aucune action recente.",
    cancelOrder: "Annuler commande",
    canceling: "Annulation...",
    canceled: "Annulee",
    ticketLegend: "(1) Contient gluten - (2) Contient celeri",
    quickAccess: "Acces rapide",
    qaKitchenSpace: "Espace cuisine",
    qaPayments: "Paiements",
    qaEvent: "Evenement / Marche",
  },
  en: {
    unknownError: "Unknown error",
    validatePaymentError: "Error while validating payment",
    back: "Back",
    logout: "Logout",
    lockTitle: "Secured cashier",
    lockSubtitle: "Enter the 4-digit code",
    pinPlaceholder: "PIN code",
    pinWrong: "Incorrect code",
    validate: "Validate",
    title: "Cashier - Payment Validation",
    subtitle: "Manual validation then send to kitchen",
    refreshing: "Refreshing...",
    refreshed: "Refreshed",
    refresh: "Refresh",
    loading: "Loading...",
    noOrders: "No orders.",
    name: "Name",
    payment: "Payment",
    validating: "Validating...",
    validatePayment: "Confirm cash payment",
    initTapToPay: "Tap to Pay on iPhone",
    creatingTapToPay: "Starting Tap to Pay...",
    tapToPayReady: "PaymentIntent created",
    tapToPayStatus: "Stripe status",
    waitStripeValidation: "Waiting for Stripe webhook (payment_intent.succeeded)...",
    piPlaceholder: "PaymentIntent ID (pi_...)",
    confirmPi: "Confirm card payment via PI",
    confirmingPi: "Checking PI...",
    validated: "Validated",
    total: "Total",
    ticketTitle: "Customer ticket",
    ticketSub: "Issued after payment validation",
    order: "Order",
    ticketSent: "Order sent to kitchen",
    thanks: "Thanks and enjoy your meal",
    reprint: "Reprint ticket",
    actionLogTitle: "Cashier action log",
    noRecentActions: "No recent actions.",
    cancelOrder: "Cancel order",
    canceling: "Canceling...",
    canceled: "Canceled",
    ticketLegend: "(1) Contains gluten - (2) Contains celery",
    quickAccess: "Quick access",
    qaKitchenSpace: "Kitchen space",
    qaPayments: "Payments",
    qaEvent: "Event / market",
  },
};

const FALLBACK_PRICE_BY_NAME = new Map<string, number>([
  ["ingwersaft", 5],
  ["hibiskussaft", 5],
  ["puff puff 1", 5],
  ["plantain chips", 5],
  ["bhb 1 2 kamerun veganer teller", 15],
  ["attieke poulet 2 elfenbeinkuste", 15],
  ["batbout mit hahnchenfullung 2 marokko", 15],
  ["pollo fino 2", 10],
  ["bh 1 2", 10],
  ["batbout mit bohnenfullung 2", 10],
]);

const FALLBACK_PRICE_BY_ID = new Map<string, number>([
  ["ingwersaft", 5],
  ["hibiskussaft", 5],
  ["puff-puff-1", 5],
  ["plantain-chips", 5],
  ["bhb-1-2-kamerun-veganer-teller", 15],
  ["attieke-poulet-2-elfenbeinkuste", 15],
  ["batbout-mit-hahnchenfullung-2-marokko", 15],
  ["pollo-fino-2", 10],
  ["bh-1-2", 10],
  ["batbout-mit-bohnenfullung-2", 10],
]);

function normalizeItemName(name?: string) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isDip(item: OrderRow["items"][number]) {
  if (String(item.id || "").startsWith("dip-")) return true;
  const normalized = normalizeItemName(item.name);
  return normalized.includes("sauce") && (normalized.includes("grune") || normalized.includes("chili"));
}

function getUnitPrice(item: OrderRow["items"][number]) {
  if (typeof item.price === "number" && Number.isFinite(item.price)) {
    return item.price;
  }
  const id = String(item.id || "");
  if (FALLBACK_PRICE_BY_ID.has(id)) {
    return FALLBACK_PRICE_BY_ID.get(id) ?? 0;
  }
  return FALLBACK_PRICE_BY_NAME.get(normalizeItemName(item.name)) ?? 0;
}

function formatEur(value: number) {
  return `${value.toFixed(2)} EUR`;
}

function getLineTotal(item: OrderRow["items"][number], dipQtySoFar: number) {
  const unitPrice = getUnitPrice(item);
  const qty = Math.max(0, Number(item.qty || 0));
  if (isDip(item)) {
    const paidQty = Math.max(0, dipQtySoFar + qty - 1) - Math.max(0, dipQtySoFar - 1);
    return paidQty * unitPrice;
  }
  return unitPrice * qty;
}

function getOrderBreakdown(order: OrderRow) {
  let dipQtySoFar = 0;
  let total = 0;
  const lineTotals = (Array.isArray(order.items) ? order.items : []).map((item) => {
    const lineTotal = getLineTotal(item, dipQtySoFar);
    if (isDip(item)) dipQtySoFar += Math.max(0, Number(item.qty || 0));
    total += lineTotal;
    return lineTotal;
  });
  return { lineTotals, total };
}

function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function parseTimestamp(value: string) {
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function isTodayOrder(order: OrderRow, todayKey: string) {
  if (String(order.id || "").startsWith(`${todayKey}-`)) return true;
  const created = new Date(order.created_at);
  if (Number.isNaN(created.getTime())) return false;
  const yyyy = created.getFullYear();
  const mm = String(created.getMonth() + 1).padStart(2, "0");
  const dd = String(created.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}` === todayKey;
}

function hasCompletedTapSetup(userId: string) {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(`af_ttp_setup_progress_${userId}`);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<{
      awarenessSeen: boolean;
      termsAccepted: boolean;
      educationSeen: boolean;
    }>;
    return Boolean(parsed.awarenessSeen && parsed.termsAccepted && parsed.educationSeen);
  } catch {
    return false;
  }
}

export default function CaissePage() {
  const showStripeDebug = process.env.NODE_ENV !== "production";
  const [lang, setLang] = useState<Lang>("de");
  const [clientPlatform, setClientPlatform] = useState<ClientPlatform>("other");
  const [pin, setPin] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);

  const [orders, setOrders] = useState<CaisseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [startingTapToPayId, setStartingTapToPayId] = useState<string | null>(null);
  const [confirmingPiId, setConfirmingPiId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLogs, setActionLogs] = useState<string[]>([]);
  const [ticketOrder, setTicketOrder] = useState<OrderRow | null>(null);
  const [tapToPayInfo, setTapToPayInfo] = useState<Record<string, { paymentIntentId: string; status: string }>>({});
  const [piByOrder, setPiByOrder] = useState<Record<string, string>>({});
  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);

  const t = UI_TEXT[lang];
  const initCardPaymentLabel = getCashierInitCardPaymentLabel(lang, clientPlatform);
  const creatingCardPaymentLabel = getCashierCreatingCardPaymentLabel(lang, clientPlatform);
  const waitingWebhookLabel = getCashierWaitingWebhookText(lang, clientPlatform);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      window.location.href = "/team/login";
      return;
    }
    if (s.role === "admin" || s.role === "cashier") {
      if (!hasCompletedTapSetup(s.userId)) {
        window.location.href = "/caisse/setup";
        return;
      }
      setStaffRole(s.role);
      setIsUnlocked(true);
    } else {
      window.location.href = "/staff";
      return;
    }
  }, []);

  function pushLog(message: string) {
    const ts = new Date().toLocaleTimeString();
    setActionLogs((prev) => [`${ts} ${message}`, ...prev].slice(0, 12));
  }

  function txt(
    fr: string,
    de: string,
    en: string
  ) {
    if (lang === "fr") return fr;
    if (lang === "de") return de;
    return en;
  }

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const aRank = a.status === "PENDING_PAYMENT" ? 0 : 1;
      const bRank = b.status === "PENDING_PAYMENT" ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
      const aTs = parseTimestamp(a.created_at);
      const bTs = parseTimestamp(b.created_at);

      if (aRank === 0) {
        if (bTs !== aTs) return bTs - aTs;
        return String(b.id).localeCompare(String(a.id));
      }

      if (a.isJustValidated !== b.isJustValidated) {
        return a.isJustValidated ? 1 : -1;
      }

      if (aTs !== bTs) return aTs - bTs;
      return String(a.id).localeCompare(String(b.id));
    });
  }, [orders]);

  const ticketBreakdown = useMemo(
    () => (ticketOrder ? getOrderBreakdown(ticketOrder) : { lineTotals: [], total: 0 }),
    [ticketOrder]
  );

  const refresh = useCallback(async () => {
    try {
      setIsRefreshing(true);
      setActionError(null);

      const allRes = await fetch("/api/orders", { cache: "no-store" });
      const allData = await allRes.json();

      const todayKey = getTodayKey();
      const todayOrders = (Array.isArray(allData) ? allData : []).filter((it) =>
        isTodayOrder(it as OrderRow, todayKey)
      );

      setOrders(todayOrders);
      setJustRefreshed(true);
      window.setTimeout(() => setJustRefreshed(false), 1200);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t.unknownError);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  }, [t.unknownError]);

  useEffect(() => {
    setLang(getSavedLang());
    setClientPlatform(detectClientPlatform());
    if (isUnlocked) {
      refresh();
    }
  }, [isUnlocked, refresh]);

  useEffect(() => {
    if (!isUnlocked) return;
    return subscribeOrderSync((message) => {
      if (message.reason === "ORDER_CREATED") {
        refresh();
      }
    });
  }, [isUnlocked, refresh]);

  function printTicket() {
    window.print();
  }

  async function markPaymentValidated(order: OrderRow) {
    try {
      pushLog(
        txt(
          `Validation manuelle demarree pour ${order.id}`,
          `Manuelle Freigabe gestartet fur ${order.id}`,
          `Manual validation started for ${order.id}`
        )
      );
      setActionError(null);
      setValidatingId(order.id);

      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "NEW" }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || t.validatePaymentError);
      }

      setTicketOrder(order);
      pushLog(
        txt(
          `Validation manuelle OK pour ${order.id} -> NEW`,
          `Manuelle Freigabe OK fur ${order.id} -> NEW`,
          `Manual validation OK for ${order.id} -> NEW`
        )
      );
      setOrders((prev) =>
        prev.map((it) =>
          it.id === order.id ? { ...it, status: "NEW", isJustValidated: true } : it
        )
      );

      window.setTimeout(() => {
        window.print();
      }, 150);

      window.setTimeout(() => {
        refresh();
      }, 900);
    } catch (e: unknown) {
      pushLog(
        txt(
          `Validation manuelle KO pour ${order.id}`,
          `Manuelle Freigabe FEHLER fur ${order.id}`,
          `Manual validation FAILED for ${order.id}`
        )
      );
      setActionError(e instanceof Error ? e.message : t.unknownError);
    } finally {
      setValidatingId(null);
    }
  }

  async function initTapToPay(order: OrderRow) {
    try {
      pushLog(
        txt(
          `Creation PaymentIntent demarree pour ${order.id}`,
          `PaymentIntent-Erstellung gestartet fur ${order.id}`,
          `PaymentIntent creation started for ${order.id}`
        )
      );
      setActionError(null);
      setStartingTapToPayId(order.id);

      const res = await fetch("/api/stripe/terminal/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || t.unknownError);
      }

      setTapToPayInfo((prev) => ({
        ...prev,
        [order.id]: {
          paymentIntentId: String(data.paymentIntentId || ""),
          status: String(data.status || ""),
        },
      }));
      setPiByOrder((prev) => ({
        ...prev,
        [order.id]: String(data.paymentIntentId || ""),
      }));

      pushLog(
        txt(
          `PaymentIntent cree pour ${order.id}: ${String(data.paymentIntentId || "-")}`,
          `PaymentIntent erstellt fur ${order.id}: ${String(data.paymentIntentId || "-")}`,
          `PaymentIntent created for ${order.id}: ${String(data.paymentIntentId || "-")}`
        )
      );

      refresh();
    } catch (e: unknown) {
      pushLog(
        txt(
          `Creation PaymentIntent KO pour ${order.id}`,
          `PaymentIntent-Erstellung FEHLER fur ${order.id}`,
          `PaymentIntent creation FAILED for ${order.id}`
        )
      );
      setActionError(e instanceof Error ? e.message : t.unknownError);
    } finally {
      setStartingTapToPayId(null);
    }
  }

  async function confirmCardByPaymentIntent(order: OrderRow) {
    try {
      setActionError(null);
      setConfirmingPiId(order.id);
      setProcessingPaymentId(order.id);
      const startedAt = Date.now();

      const paymentIntentId = String(piByOrder[order.id] || "").trim();
      pushLog(
        txt(
          `Confirmation PI demarree pour ${order.id}${paymentIntentId ? ` (${paymentIntentId})` : ""}`,
          `PI-Bestatigung gestartet fur ${order.id}${paymentIntentId ? ` (${paymentIntentId})` : ""}`,
          `PI confirmation started for ${order.id}${paymentIntentId ? ` (${paymentIntentId})` : ""}`
        )
      );
      const res = await fetch(`/api/orders/${order.id}/stripe-confirm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          paymentIntentId ? { paymentIntentId } : {}
        ),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || t.validatePaymentError);
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed < 900) {
        await new Promise((resolve) => setTimeout(resolve, 900 - elapsed));
      }

      setTicketOrder({
        ...order,
        status: "NEW",
      });
      pushLog(
        txt(
          `Confirmation PI OK pour ${order.id} -> NEW`,
          `PI-Bestatigung OK fur ${order.id} -> NEW`,
          `PI confirmation OK for ${order.id} -> NEW`
        )
      );
      setOrders((prev) =>
        prev.map((it) =>
          it.id === order.id ? { ...it, status: "NEW", isJustValidated: true } : it
        )
      );

      window.setTimeout(() => {
        window.print();
      }, 150);

      window.setTimeout(() => {
        refresh();
      }, 900);
    } catch (e: unknown) {
      pushLog(
        txt(
          `Confirmation PI KO pour ${order.id}`,
          `PI-Bestatigung FEHLER fur ${order.id}`,
          `PI confirmation FAILED for ${order.id}`
        )
      );
      setActionError(e instanceof Error ? e.message : t.unknownError);
    } finally {
      setConfirmingPiId(null);
      setProcessingPaymentId(null);
    }
  }

  async function cancelOrder(order: OrderRow) {
    try {
      setActionError(null);
      setCancelingId(order.id);
      pushLog(
        txt(
          `Annulation demarree pour ${order.id}`,
          `Stornierung gestartet fur ${order.id}`,
          `Cancel started for ${order.id}`
        )
      );

      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELED" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || t.unknownError);
      }

      setOrders((prev) => prev.map((it) => (it.id === order.id ? { ...it, status: "CANCELED" } : it)));
      pushLog(
        txt(
          `Annulation OK pour ${order.id} -> CANCELED`,
          `Stornierung OK fur ${order.id} -> CANCELED`,
          `Cancel OK for ${order.id} -> CANCELED`
        )
      );
    } catch (e: unknown) {
      pushLog(
        txt(
          `Annulation KO pour ${order.id}`,
          `Stornierung FEHLER fur ${order.id}`,
          `Cancel FAILED for ${order.id}`
        )
      );
      setActionError(e instanceof Error ? e.message : t.unknownError);
    } finally {
      setCancelingId(null);
    }
  }

  if (!isUnlocked) {
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: 24,
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui",
          backgroundColor: "#FFF3E6",
          backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center, center",
          backgroundSize: "cover, min(64vw, 420px)",
          color: "#111",
        }}
      >
        <div style={{ width: "100%", maxWidth: 360, background: "rgba(17,24,39,0.85)", border: "1px solid #334155", borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => goBackOr("/staff")}
              className="af-link-btn"
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #475569",
                background: "white",
                color: "#111",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {t.back}
            </button>
            {(["de", "fr", "en"] as Lang[]).map((L) => (
              <button
                key={L}
                type="button"
                onClick={() => {
                  setLang(L);
                  saveLang(L);
                }}
                className={`af-lang-btn ${lang === L ? "is-active" : ""}`}
              >
                {L.toUpperCase()}
              </button>
            ))}
          </div>
          <h1 style={{ margin: "10px 0 0 0", fontSize: 24, fontWeight: 900 }}>{t.lockTitle}</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>{t.lockSubtitle}</p>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            type="password"
            autoComplete="off"
            inputMode="numeric"
            placeholder={t.pinPlaceholder}
            style={{ marginTop: 10, width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #475569", background: "#0f172a", color: "white" }}
          />
          {pinError ? <div style={{ marginTop: 8, color: "#fca5a5", fontWeight: 700 }}>{pinError}</div> : null}
          <button
            className="af-btn"
            type="button"
            onClick={() => {
              if (pin === CASHIER_PIN) {
                setPinError(null);
                setIsUnlocked(true);
              } else {
                setPinError(t.pinWrong);
              }
            }}
            style={{ marginTop: 10, width: "100%", padding: "10px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#ff7a00,#ff3c00)", color: "white", fontWeight: 900, cursor: "pointer" }}
          >
            {t.validate}
          </button>
        </div>
      </main>
    );
  }

	  return (
	    <main
	      style={{
	        padding: 24,
        fontFamily: "system-ui",
        backgroundColor: "#FFF3E6",
        backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center, center",
        backgroundSize: "cover, min(64vw, 420px)",
        minHeight: "100vh",
	        color: "#111",
	      }}
	    >
	      <div style={{ maxWidth: 980, margin: "0 auto" }}>
	        <div
	          style={{
	            display: "flex",
	            justifyContent: "space-between",
	            alignItems: "center",
	            gap: 10,
	            flexWrap: "wrap",
	            background: "white",
	            border: "1px solid #F1D7C8",
	            borderRadius: 12,
	            padding: 12,
	            boxShadow: "0 12px 30px rgba(242,140,40,0.18)",
	            position: "sticky",
	            top: 12,
	            zIndex: 20,
	          }}
	        >
	          <div>
	            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
	              <img src="/logo-afrofood.png" alt="AfroFood" style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover", border: "1px solid #F1D7C8" }} />
	              {t.title}
	            </h1>
	            <div style={{ opacity: 0.75, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
	              <span>{t.subtitle}</span>
	              {staffRole ? <span className="af-role-badge">Role: {getStaffRoleLabel(staffRole, lang)}</span> : null}
	            </div>
	          </div>
	          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
	            {(["de", "fr", "en"] as Lang[]).map((L) => (
	              <button
	                key={L}
	                type="button"
	                onClick={() => {
	                  setLang(L);
	                  saveLang(L);
	                }}
	                className={`af-lang-btn ${lang === L ? "is-active" : ""}`}
	              >
	                {L.toUpperCase()}
	              </button>
	            ))}
			            <button
			              type="button"
			              onClick={() => goBackOr("/staff")}
			              className="af-link-btn"
			              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800, cursor: "pointer" }}
			            >
			              {t.back}
			            </button>
		            <button
		              className="af-btn"
		              type="button"
		              onClick={() => {
		                clearSession();
		                window.location.href = "/team/login";
		              }}
		              style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: "#111", color: "white", fontWeight: 800, cursor: "pointer" }}
		            >
		              {t.logout}
		            </button>
		          </div>
		        </div>

	        <div
	          style={{
	            height: 6,
	            borderRadius: 999,
	            marginTop: 12,
	            background:
	              "repeating-linear-gradient(90deg, #111 0 10px, #F28C28 10px 20px, #111 20px 30px, #fff 30px 40px)",
	            opacity: 0.9,
	          }}
	        />

	        <div
	          style={{
	            marginTop: 12,
	            padding: 10,
	            borderRadius: 12,
	            border: "1px solid #F1D7C8",
	            background: "white",
	          }}
	        >
	          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
	            <a className="af-link-btn" href="/staff/cuisine?from=caisse" style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800, textDecoration: "none" }}>
	              {t.qaKitchenSpace}
	            </a>
	            <a className="af-link-btn" href="/admin/menu?view=payment&from=caisse" style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800, textDecoration: "none" }}>
	              {t.qaPayments}
	            </a>
	            <a className="af-link-btn" href="/admin/menu?view=event&from=caisse" style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800, textDecoration: "none" }}>
	              {t.qaEvent}
	            </a>
	          </div>
	        </div>

		        {loading ? <p style={{ marginTop: 12 }}>{t.loading}</p> : null}
		        {actionError ? <p style={{ marginTop: 8, color: "#fecaca", fontWeight: 700 }}>{actionError}</p> : null}
		        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-start" }}>
		          <button
		            className="af-btn"
		            onClick={refresh}
		            disabled={isRefreshing}
		            style={{
		              padding: "10px 14px",
		              borderRadius: 12,
		              border: "none",
		              background: isRefreshing
		                ? "linear-gradient(135deg,#f59e0b,#d97706)"
		                : justRefreshed
		                ? "linear-gradient(135deg,#16a34a,#15803d)"
		                : "linear-gradient(135deg,#2563eb,#1d4ed8)",
		              color: "white",
		              fontWeight: 900,
		              cursor: isRefreshing ? "not-allowed" : "pointer",
		              opacity: isRefreshing ? 0.85 : 1,
		            }}
		          >
		            {isRefreshing ? t.refreshing : justRefreshed ? t.refreshed : t.refresh}
		          </button>
		        </div>
		        <div
		          style={{
		            marginTop: 12,
	            padding: 10,
	            borderRadius: 12,
	            border: "1px solid #F1D7C8",
	            background: "rgba(255,255,255,0.9)",
	          }}
	        >
		          <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
		            <div style={{ fontWeight: 900 }}>{t.actionLogTitle}</div>
		          </div>
	          {actionLogs.length === 0 ? (
	            <div style={{ opacity: 0.7 }}>{t.noRecentActions}</div>
	          ) : (
	            actionLogs.map((line, idx) => (
	              <div key={`${line}-${idx}`} style={{ fontSize: 13, opacity: 0.9, padding: "2px 0" }}>
	                {line}
	              </div>
	            ))
	          )}
	        </div>

	        {sortedOrders.length === 0 ? <p style={{ opacity: 0.8, marginTop: 12 }}>{t.noOrders}</p> : null}
	        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {sortedOrders.map((o) => {
          const isPending = o.status === "PENDING_PAYMENT";
          const isCanceled = o.status === "CANCELED";
          const breakdown = getOrderBreakdown(o);

          return (
            <div
              key={o.id}
              style={{
                background: isPending
                  ? "rgba(249,115,22,0.22)"
                  : isCanceled
                  ? "rgba(100,116,139,0.25)"
                  : "rgba(22,163,74,0.22)",
                borderRadius: 16,
                padding: 16,
                border: isPending ? "1px solid #fb923c" : isCanceled ? "1px solid #64748b" : "1px solid #22c55e",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{o.id}</div>
                  <div style={{ opacity: 0.9, marginTop: 2 }}>
                    {o.customer_name ? `${t.name}: ${o.customer_name} - ` : ""}
                    {t.payment}: {o.payment}
                  </div>
                </div>

                {isPending ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {o.payment === "card" ? (
                      <>
                        <button
                          onClick={() => initTapToPay(o)}
                          disabled={startingTapToPayId === o.id}
                          style={{
                            padding: "16px 22px",
                            borderRadius: 14,
                            border: "none",
                            background:
                              startingTapToPayId === o.id
                                ? "linear-gradient(135deg,#f59e0b,#d97706)"
                                : "linear-gradient(135deg,#2563eb,#1d4ed8)",
                            color: "white",
                            fontWeight: 900,
                            fontSize: 18,
                            lineHeight: 1.15,
                            minWidth: 290,
                            textAlign: "center",
                            boxShadow: "0 12px 30px rgba(37,99,235,0.28)",
                            cursor: startingTapToPayId === o.id ? "not-allowed" : "pointer",
                            opacity: startingTapToPayId === o.id ? 0.8 : 1,
                          }}
                        >
                          {startingTapToPayId === o.id ? creatingCardPaymentLabel : initCardPaymentLabel}
                        </button>

                        {tapToPayInfo[o.id]?.paymentIntentId ? (
                          <div
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #93c5fd",
                              background: "rgba(59,130,246,0.12)",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {showStripeDebug ? (
                              <>
                                {t.tapToPayReady}: {tapToPayInfo[o.id].paymentIntentId}
                                <br />
                                {t.tapToPayStatus}: {tapToPayInfo[o.id].status}
                                <br />
                              </>
                            ) : null}
                            {waitingWebhookLabel}
                          </div>
                        ) : null}

                        <div style={{ display: "grid", gap: 6 }}>
                          <input
                            value={piByOrder[o.id] || ""}
                            onChange={(e) =>
                              setPiByOrder((prev) => ({
                                ...prev,
                                [o.id]: e.target.value,
                              }))
                            }
                            placeholder={t.piPlaceholder}
                            style={{
                              width: 320,
                              maxWidth: "100%",
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #93c5fd",
                              background: "white",
                              color: "#111",
                              fontWeight: 700,
                            }}
                          />
                          <button
                            onClick={() => confirmCardByPaymentIntent(o)}
                            disabled={confirmingPiId === o.id}
                            type="button"
                            style={{
                              padding: "10px 14px",
                              borderRadius: 12,
                              border: "none",
                              background:
                                confirmingPiId === o.id
                                  ? "linear-gradient(135deg,#f59e0b,#d97706)"
                                  : "linear-gradient(135deg,#08a045,#0d8f3f)",
                              color: "white",
                              fontWeight: 900,
                              cursor: confirmingPiId === o.id ? "not-allowed" : "pointer",
                              opacity: confirmingPiId === o.id ? 0.8 : 1,
                            }}
                          >
                            {confirmingPiId === o.id ? t.confirmingPi : t.confirmPi}
                          </button>
                        </div>
                        {processingPaymentId === o.id ? (
                          <div
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #fcd34d",
                              background: "rgba(250,204,21,0.15)",
                              fontWeight: 800,
                            }}
                          >
                            {txt(
                              "Processing payment...",
                              "Zahlung wird verarbeitet...",
                              "Processing payment..."
                            )}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <button
                        onClick={() => markPaymentValidated(o)}
                        disabled={validatingId === o.id}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: "none",
                          background:
                            validatingId === o.id
                              ? "linear-gradient(135deg,#f59e0b,#d97706)"
                              : "linear-gradient(135deg,#08a045,#0d8f3f)",
                          color: "white",
                          fontWeight: 900,
                          cursor: validatingId === o.id ? "not-allowed" : "pointer",
                          opacity: validatingId === o.id ? 0.8 : 1,
                        }}
                      >
                        {validatingId === o.id ? t.validating : t.validatePayment}
                      </button>
                    )}
                  </div>
                ) : isCanceled ? (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: "linear-gradient(135deg,#475569,#334155)",
                      color: "white",
                      fontWeight: 900,
                    }}
                  >
                    {t.canceled}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: "linear-gradient(135deg,#16a34a,#15803d)",
                      color: "white",
                      fontWeight: 900,
                    }}
                  >
                    {t.validated}
                  </div>
                )}
              </div>

              {isPending ? (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => cancelOrder(o)}
                    disabled={cancelingId === o.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "none",
                      background:
                        cancelingId === o.id
                          ? "linear-gradient(135deg,#f59e0b,#d97706)"
                          : "linear-gradient(135deg,#b91c1c,#991b1b)",
                      color: "white",
                      fontWeight: 900,
                      cursor: cancelingId === o.id ? "not-allowed" : "pointer",
                      opacity: cancelingId === o.id ? 0.8 : 1,
                    }}
                  >
                    {cancelingId === o.id ? t.canceling : t.cancelOrder}
                  </button>
                </div>
              ) : null}

              <div style={{ marginTop: 12, borderTop: "1px dashed rgba(255,255,255,0.25)", paddingTop: 10 }}>
                {Array.isArray(o.items)
                  ? o.items.map((it, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                        <div style={{ fontWeight: 800 }}>
                          {it.name} <span style={{ opacity: 0.8 }}>x{it.qty}</span>
                        </div>
                        <div style={{ fontWeight: 900 }}>{formatEur(breakdown.lineTotals[idx] ?? 0)}</div>
                      </div>
                    ))
                  : null}

                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 10,
                    borderTop: "1px dashed rgba(255,255,255,0.25)",
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 900,
                    fontSize: 18,
                  }}
                >
                  <span>{t.total}</span>
                  <span>{formatEur(breakdown.total)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

	      {ticketOrder ? (
	        <div className="af-ticket-wrap af-ticket-area af-ticket-customer" style={{ marginTop: 20, justifyItems: "center" }}>
          <div className="af-ticket">
            <div className="af-ticket-head">
              <img className="af-ticket-logo" src="/logo-afrofood.png" alt="AfroFood" />
              <div className="af-ticket-title">{t.ticketTitle}</div>
              <div className="af-ticket-sub">{t.ticketSub}</div>
            </div>

            <div className="af-ticket-meta">
              <div>
                <b>{t.order}:</b> {ticketOrder.id}
              </div>
              <div>
                <b>{t.name}:</b> {ticketOrder.customer_name || "-"}
              </div>
              <div>
                <b>{t.payment}:</b> {ticketOrder.payment}
              </div>
            </div>
            <div
              style={{
                marginTop: 8,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #93c5fd",
                background: "rgba(59,130,246,0.1)",
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              {txt(
                "Receipt available via QR",
                "Beleg per QR verfugbar",
                "Receipt available via QR"
              )}
            </div>

            <div className="af-ticket-items">
              {ticketOrder.items.map((it, idx) => (
                <div key={idx} className="af-ticket-row">
                  <div className="af-ticket-name">{it.name}</div>
                  <div className="af-ticket-qty">
                    x{it.qty} - {(ticketBreakdown.lineTotals[idx] ?? 0).toFixed(2)} EUR
                  </div>
                </div>
              ))}
            </div>

            <div className="af-ticket-meta">
              <div>
                <b>{t.total}:</b> {ticketBreakdown.total.toFixed(2)} EUR
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{t.ticketLegend}</div>
            </div>

            <div className="af-ticket-qr">
              <QRCodeCanvas
                value={makeQrPayload({
                  id: ticketOrder.id,
                  createdAt: ticketOrder.created_at,
                  customerName: ticketOrder.customer_name || undefined,
                  payment: ticketOrder.payment,
                  items: ticketOrder.items,
                })}
                size={72}
              />
              <div className="af-ticket-qrtext">{t.ticketSent}</div>
            </div>

            <div className="af-ticket-foot">{t.thanks}</div>
          </div>

          <button
            onClick={printTicket}
            type="button"
            style={{
              marginTop: 10,
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #111",
              background: "white",
              color: "#111",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {t.reprint}
          </button>
	        </div>
	      ) : null}
	      </div>
	    </main>
	  );
	}

