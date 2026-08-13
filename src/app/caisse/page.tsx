"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrderRow } from "@/lib/schema";
import { QRCodeCanvas } from "qrcode.react";
import { makeQrPayload } from "@/lib/order";
import { subscribeOrderSync } from "@/lib/order-sync";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { clearSession, getSession, getStaffRoleLabel, type StaffRole, type StaffSession } from "@/lib/staff-auth";
import { goBackOr } from "@/lib/client-nav";
import {
  detectClientPlatform,
  getCashierCreatingCardPaymentLabel,
  getCashierInitCardPaymentLabel,
  getCashierWaitingWebhookText,
  type ClientPlatform,
} from "@/lib/payment-platform";

const CASHIER_PIN = process.env.NEXT_PUBLIC_CAISSE_PIN || "1955";
const TERMINAL_DEEP_LINK_SCHEME = "afrofoodterminal";

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
  const orderId = String(order.id || "");
  const created = new Date(order.created_at);
  if (!Number.isNaN(created.getTime())) {
    const yyyy = created.getFullYear();
    const mm = String(created.getMonth() + 1).padStart(2, "0");
    const dd = String(created.getDate()).padStart(2, "0");
    if (`${yyyy}${mm}${dd}` === todayKey) return true;
  }

  const datedId = orderId.match(/^(\d{8})-/);
  return datedId ? datedId[1] === todayKey : false;
}

async function hasCompletedTapSetup() {
  try {
    const res = await fetch("/api/menu-config", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    const config = data?.tapToPayConfig as
      | Partial<{
          awarenessSeen: boolean;
          termsAccepted: boolean;
          educationSeen: boolean;
        }>
      | undefined;
    return Boolean(res.ok && config?.awarenessSeen && config?.termsAccepted && config?.educationSeen);
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
  const [staffSession, setStaffSession] = useState<StaffSession | null>(null);
  const [activeEventName, setActiveEventName] = useState("");

  const [orders, setOrders] = useState<CaisseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [startingTapToPayId, setStartingTapToPayId] = useState<string | null>(null);
  const [confirmingPiId, setConfirmingPiId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [activeTerminalOrderId, setActiveTerminalOrderId] = useState<string | null>(null);
  const [handledPaymentOrderIds, setHandledPaymentOrderIds] = useState<string[]>([]);
  const handledPaymentOrderIdsRef = useRef<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLogs, setActionLogs] = useState<string[]>([]);
  const [ticketOrder, setTicketOrder] = useState<OrderRow | null>(null);
  const [tapToPayInfo, setTapToPayInfo] = useState<Record<string, { paymentIntentId: string; status: string }>>({});
  const [piByOrder, setPiByOrder] = useState<Record<string, string>>({});
  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);

  const t = UI_TEXT[lang];
  const initCardPaymentLabel = getCashierInitCardPaymentLabel(lang, clientPlatform);
  const creatingCardPaymentLabel = getCashierCreatingCardPaymentLabel(lang, clientPlatform);
  const waitingWebhookLabel = getCashierWaitingWebhookText(lang, clientPlatform);

  useEffect(() => {
    const updateNarrowScreen = () => setIsNarrowScreen(window.innerWidth < 720);
    updateNarrowScreen();
    window.addEventListener("resize", updateNarrowScreen);
    return () => window.removeEventListener("resize", updateNarrowScreen);
  }, []);

  useEffect(() => {
    async function unlock() {
      const s = getSession();
      if (!s) {
        window.location.href = "/team/login";
        return;
      }
      if (s.role === "admin" || s.role === "cashier") {
        setStaffRole(s.role);
        setStaffSession(s);
        setIsUnlocked(true);
      } else {
        window.location.href = "/staff";
      }
    }
    void unlock();
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

  useEffect(() => {
    async function loadActiveEventName() {
      if (!staffRole) return;
      try {
        const res = await fetch("/api/admin/menu-config", {
          headers: { "x-staff-role": staffRole },
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok) {
          setActiveEventName(String(data.storeConfig?.activeEventName || "").trim());
        }
      } catch {
        setActiveEventName("");
      }
    }
    void loadActiveEventName();
  }, [staffRole]);

  async function sendCashierLock(action: "acquire" | "heartbeat" | "release") {
    if (!staffRole || !staffSession) return;
    const res = await fetch("/api/cashier-lock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-staff-role": staffRole,
      },
      body: JSON.stringify({
        action,
        eventName: activeEventName,
        userId: staffSession.userId,
        username: staffSession.username,
      }),
      keepalive: action === "release",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const activeCashier = String(data?.lock?.username || "").trim();
      throw new Error(
        activeCashier
          ? txt(
              `Cet evenement est deja ouvert par ${activeCashier}.`,
              `Dieses Event ist bereits von ${activeCashier} geoffnet.`,
              `This event is already open by ${activeCashier}.`
            )
          : data?.error || t.unknownError
      );
    }
  }

  useEffect(() => {
    if (!isUnlocked || !staffRole || !staffSession) return;
    let stopped = false;

    async function heartbeat() {
      try {
        await sendCashierLock("heartbeat");
      } catch (e: unknown) {
        if (!stopped) {
          setActionError(e instanceof Error ? e.message : t.unknownError);
          setIsUnlocked(false);
        }
      }
    }

    void heartbeat();
    const id = window.setInterval(() => {
      void heartbeat();
    }, 30000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [isUnlocked, staffRole, staffSession, activeEventName, lang]);

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
        return a.isJustValidated ? -1 : 1;
      }

      if (bTs !== aTs) return bTs - aTs;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [orders]);

  const ticketBreakdown = useMemo(
    () => (ticketOrder ? getOrderBreakdown(ticketOrder) : { lineTotals: [], total: 0 }),
    [ticketOrder]
  );

  function TicketBlock() {
    if (!ticketOrder) return null;
    return (
      <div className="af-ticket-wrap af-ticket-area af-ticket-customer" style={{ marginTop: 14, justifyItems: "center" }}>
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
    );
  }

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

      setOrders(
        todayOrders.map((order) => ({
          ...(order as CaisseCard),
          isJustValidated: handledPaymentOrderIdsRef.current.has(String((order as OrderRow).id || "")),
        }))
      );
      setActiveTerminalOrderId((prev) => {
        if (!prev) return prev;
        const stillPending = todayOrders.some(
          (order) => order.id === prev && order.status === "PENDING_PAYMENT"
        );
        return stillPending ? prev : null;
      });
      setJustRefreshed(true);
      window.setTimeout(() => setJustRefreshed(false), 1200);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t.unknownError);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  }, [t.unknownError]);

  const loadOrderById = useCallback(async (orderId: string) => {
    const res = await fetch("/api/orders", { cache: "no-store" });
    const data = await res.json().catch(() => []);
    if (!res.ok || !Array.isArray(data)) return null;
    return (data as OrderRow[]).find((order) => order.id === orderId) || null;
  }, []);

  const handlePaymentValidated = useCallback(async (orderId: string) => {
    const cleanOrderId = String(orderId || "").trim();
    if (!cleanOrderId) return;
    if (handledPaymentOrderIdsRef.current.has(cleanOrderId)) return;
    handledPaymentOrderIdsRef.current.add(cleanOrderId);

    setHandledPaymentOrderIds((prev) =>
      prev.includes(cleanOrderId) ? prev : [...prev, cleanOrderId].slice(-20)
    );
    setActiveTerminalOrderId((prev) => (prev === cleanOrderId ? null : prev));
    pushLog(
      txt(
        `Paiement Tap to Pay confirme pour ${cleanOrderId}`,
        `Tap to Pay Zahlung bestatigt fur ${cleanOrderId}`,
        `Tap to Pay payment confirmed for ${cleanOrderId}`
      )
    );
    const order = await loadOrderById(cleanOrderId);
    if (order) {
      const paidOrder = { ...order, status: "NEW" as const, isJustValidated: true };
      setTicketOrder(paidOrder);
      setOrders((prev) => {
        const exists = prev.some((it) => it.id === paidOrder.id);
        const next = exists
          ? prev.map((it) => (it.id === paidOrder.id ? paidOrder : it))
          : [paidOrder, ...prev];
        return next;
      });
    }
    refresh();
  }, [loadOrderById, refresh, lang]);

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
      if (message.reason === "ORDER_STATUS_CHANGED") {
        refresh();
      }
      if (message.reason === "PAYMENT_VALIDATED" && message.orderId) {
        void handlePaymentValidated(message.orderId);
      }
    });
  }, [isUnlocked, handlePaymentValidated, refresh]);

  useEffect(() => {
    const orderId = activeTerminalOrderId;
    if (!isUnlocked || !orderId) return;
    const terminalOrderId: string = orderId;
    let stopped = false;

    async function pollActiveTerminalOrder() {
      try {
        const order = await loadOrderById(terminalOrderId);
        if (!stopped && order?.status === "NEW") {
          void handlePaymentValidated(terminalOrderId);
        }
      } catch {
        // The live event path remains primary; polling is a fallback.
      }
    }

    void pollActiveTerminalOrder();
    const interval = window.setInterval(() => {
      void pollActiveTerminalOrder();
    }, 2500);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [isUnlocked, activeTerminalOrderId, loadOrderById, handlePaymentValidated]);

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
    const session = getSession();

    try {
      pushLog(
        txt(
          `Envoi de ${order.id} vers AfroFood Terminal`,
          `${order.id} wird an AfroFood Terminal gesendet`,
          `Sending ${order.id} to AfroFood Terminal`
        )
      );
      setActionError(null);
      setStartingTapToPayId(order.id);
      setActiveTerminalOrderId(order.id);

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

      const terminalRes = await fetch("/api/terminal-active-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-staff-role": staffRole || "",
        },
        body: JSON.stringify({
          username: session?.username || staffSession?.username || "cashier",
          userId: session?.userId || staffSession?.userId || null,
          eventName: activeEventName,
          orderId: order.id,
          paymentIntentId: String(data.paymentIntentId || ""),
        }),
      });
      const terminalData = await terminalRes.json().catch(() => null);
      if (!terminalRes.ok || !terminalData?.ok) {
        throw new Error(terminalData?.error || t.unknownError);
      }

      pushLog(
        txt(
          `Commande ${order.id} disponible sur l'iPhone Terminal`,
          `Bestellung ${order.id} ist auf dem Terminal-iPhone verfugbar`,
          `Order ${order.id} is available on the Terminal iPhone`
        )
      );
    } catch (e: unknown) {
      pushLog(
        txt(
          `Envoi Terminal KO pour ${order.id}`,
          `Terminal-Senden fehlgeschlagen fur ${order.id}`,
          `Terminal send failed for ${order.id}`
        )
      );
      setActionError(e instanceof Error ? e.message : t.unknownError);
    } finally {
      setStartingTapToPayId(null);
      refresh();
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
      setActiveTerminalOrderId((prev) => (prev === order.id ? null : prev));
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
          {actionError ? <div style={{ marginTop: 8, color: "#fca5a5", fontWeight: 700 }}>{actionError}</div> : null}
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
	        padding: isNarrowScreen ? 12 : 24,
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
	            <h1 style={{ margin: 0, fontSize: isNarrowScreen ? 22 : 24, fontWeight: 900, display: "flex", alignItems: "center", gap: 8, lineHeight: 1.12 }}>
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
			              onClick={() => {
			                void sendCashierLock("release").finally(() => goBackOr("/staff"));
			              }}
			              className="af-link-btn"
			              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800, cursor: "pointer" }}
			            >
			              {t.back}
			            </button>
		            <button
		              className="af-btn"
		              type="button"
		              onClick={() => {
		                void sendCashierLock("release").finally(() => {
		                  clearSession();
		                  window.location.href = "/team/login";
		                });
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
	            background: "rgba(255,255,255,0.92)",
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
	            border: "1px solid #cbd5e1",
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
          const isActiveTerminalOrder = activeTerminalOrderId === o.id;
          const isBlockedByAnotherTerminalOrder =
            Boolean(activeTerminalOrderId) && activeTerminalOrderId !== o.id;

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
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: isNarrowScreen ? "stretch" : "center", flexDirection: isNarrowScreen ? "column" : "row" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: isNarrowScreen ? 18 : 20, fontWeight: 900, overflowWrap: "anywhere", lineHeight: 1.15 }}>{o.id}</div>
                  <div style={{ opacity: 0.9, marginTop: 2 }}>
                    {o.customer_name ? `${t.name}: ${o.customer_name} - ` : ""}
                    {t.payment}: {o.payment}
                  </div>
                </div>

                {isPending ? (
                  <div style={{ display: "grid", gap: 8, width: isNarrowScreen ? "100%" : undefined, minWidth: 0 }}>
                    {o.payment === "card" ? (
                      <>
                        <button
                          onClick={() => initTapToPay(o)}
                          disabled={startingTapToPayId === o.id || isBlockedByAnotherTerminalOrder}
                          style={{
                            padding: "16px 22px",
                            borderRadius: 14,
                            border: "none",
                            background:
                              startingTapToPayId === o.id
                                ? "linear-gradient(135deg,#f59e0b,#d97706)"
                                : isBlockedByAnotherTerminalOrder
                                ? "linear-gradient(135deg,#64748b,#475569)"
                                : "linear-gradient(135deg,#2563eb,#1d4ed8)",
                            color: "white",
                            fontWeight: 900,
                            fontSize: 18,
                            lineHeight: 1.15,
                            minWidth: isNarrowScreen ? 0 : 290,
                            width: isNarrowScreen ? "100%" : undefined,
                            textAlign: "center",
                            boxShadow: "0 12px 30px rgba(37,99,235,0.28)",
                            cursor:
                              startingTapToPayId === o.id || isBlockedByAnotherTerminalOrder
                                ? "not-allowed"
                                : "pointer",
                            opacity: startingTapToPayId === o.id || isBlockedByAnotherTerminalOrder ? 0.8 : 1,
                          }}
                        >
                          {startingTapToPayId === o.id
                            ? creatingCardPaymentLabel
                            : isBlockedByAnotherTerminalOrder
                            ? txt(
                                `Commande ${activeTerminalOrderId} en validation`,
                                `Bestellung ${activeTerminalOrderId} wird validiert`,
                                `Order ${activeTerminalOrderId} is validating`
                              )
                            : isActiveTerminalOrder
                            ? txt(
                                "Reprendre validation paiement carte",
                                "Kartenzahlung fortsetzen",
                                "Resume card payment validation"
                              )
                            : initCardPaymentLabel}
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
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", minWidth: 0 }}>
                        <div style={{ fontWeight: 800, minWidth: 0, overflowWrap: "anywhere" }}>
                          {it.name} <span style={{ opacity: 0.8 }}>x{it.qty}</span>
                        </div>
                        <div style={{ fontWeight: 900, flexShrink: 0 }}>{formatEur(breakdown.lineTotals[idx] ?? 0)}</div>
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
              {ticketOrder?.id === o.id ? <TicketBlock /> : null}
            </div>
          );
        })}
      </div>
	      </div>
	    </main>
	  );
	}
