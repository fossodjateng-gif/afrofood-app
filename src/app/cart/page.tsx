"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { translations, type Lang, getSavedLang, saveLang } from "@/lib/translations";
import { makeOrderId, cartToTicketItems, makeQrPayload, type PaymentMethod, type Order } from "@/lib/order";
import { QRCodeCanvas } from "qrcode.react";
import {
  getCart,
  clearCart,
  incrementItem,
  decrementItem,
  removeItem,
  replaceCart,
  updateItemUnitNote,
  type CartItem,
} from "@/lib/cart";
import type { OrderRow, OrderStatus } from "@/lib/schema";
import { subscribeOrderSync } from "@/lib/order-sync";
import { detectClientPlatform, getCardPaymentHintText, type ClientPlatform } from "@/lib/payment-platform";
import { goBackOr } from "@/lib/client-nav";

const BRAND = {
  orange: "#F28C28",
  orangeSoft: "#FFF3E6",
  black: "#111111",
  border: "#F1D7C8",
};

const UI = {
  page: {
    padding: 24,
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    maxWidth: 1000,
    margin: "0 auto",
    backgroundColor: BRAND.orangeSoft,
    backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    backgroundSize: "cover, min(64vw, 420px)",
    minHeight: "100vh",
  } as const,
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 20,
    border: "1px solid #111",
    boxShadow: "0 18px 38px rgba(0,0,0,0.36)",
    background: "white",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    marginBottom: 12,
    flexWrap: "wrap",
  } as const,
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    justifyContent: "center",
    textAlign: "center",
  } as const,
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 900,
    letterSpacing: -0.4,
    color: BRAND.black,
    lineHeight: 1.1,
  } as const,
  subtitle: {
    marginTop: 4,
    color: "#5f5f5f",
    fontSize: 13,
  } as const,
  section: {
    marginTop: 22,
    padding: "16px 18px",
    borderRadius: 22,
    border: "1px solid #F1D7C8",
    background: "rgba(255,255,255,0.9)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 18px 38px rgba(0,0,0,0.28)",
  } as const,
  sectionTitle: {
    fontSize: 22,
    fontWeight: 900,
    margin: 0,
    paddingBottom: 12,
    borderBottom: "1px solid rgba(17,17,17,0.06)",
    letterSpacing: -0.3,
    color: BRAND.black,
  } as const,
  card: {
    border: "1px solid #F1D7C8",
    borderRadius: 20,
    padding: 16,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    background: "rgba(255,250,246,0.92)",
    boxShadow: "0 14px 30px rgba(0,0,0,0.24)",
  } as const,
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #F1D7C8",
    background: "rgba(255,255,255,0.92)",
    color: BRAND.black,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  } as const,
  notice: {
    marginTop: 12,
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid #111",
    background: "rgba(28,21,16,0.88)",
  } as const,
};

const LAST_ORDER_KEY = "af_last_order_id";
const EVENT_ID_KEY = "af_event_id";
const EVENT_NAME_KEY = "af_event_name";
const DEFAULT_EVENT_NAME = process.env.NEXT_PUBLIC_ACTIVE_EVENT || "";
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function mapRowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    createdAt: row.created_at,
    customerName: row.customer_name || undefined,
    eventId: row.event_id || undefined,
    eventName: row.event_name || undefined,
    reservationRequested: row.reservation_requested === true,
    reservationTime: row.reservation_time || undefined,
    payment: row.payment,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

function formatReservationDateTime(value: string, lang: Lang) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString(lang === "fr" ? "fr-FR" : lang === "de" ? "de-DE" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeItemName(name?: string) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isDipItem(item: { id?: string; name: string }) {
  if (String(item.id || "").startsWith("dip-")) return true;
  const normalized = normalizeItemName(item.name);
  return normalized.includes("sauce") && (normalized.includes("grune") || normalized.includes("chili"));
}

function getUnitPrice(item: { name: string; price?: number }) {
  if (typeof item.price === "number" && Number.isFinite(item.price)) {
    return item.price;
  }
  const id = String((item as { id?: string }).id || "");
  if (FALLBACK_PRICE_BY_ID.has(id)) {
    return FALLBACK_PRICE_BY_ID.get(id) ?? 0;
  }
  return FALLBACK_PRICE_BY_NAME.get(normalizeItemName(item.name)) ?? 0;
}

function getTicketBreakdown(items: Array<{ id?: string; name: string; qty: number; price?: number }>) {
  let dipQtySoFar = 0;
  let total = 0;
  const lineTotals = items.map((item) => {
    const qty = Math.max(0, Number(item.qty || 0));
    let lineTotal = 0;
    if (isDipItem(item)) {
      const paidQty = Math.max(0, dipQtySoFar + qty - 1) - Math.max(0, dipQtySoFar - 1);
      lineTotal = paidQty * getUnitPrice(item);
      dipQtySoFar += qty;
    } else {
      lineTotal = getUnitPrice(item) * qty;
    }
    total += lineTotal;
    return lineTotal;
  });
  return { lineTotals, total };
}

function getCartBreakdown(items: CartItem[]) {
  let dipQtySoFar = 0;
  let dipExtra = 0;
  let total = 0;

  const lineTotals = items.map((item) => {
    const qty = Math.max(0, Number(item.qty || 0));
    if (isDipItem(item)) {
      const paidQty = Math.max(0, dipQtySoFar + qty - 1) - Math.max(0, dipQtySoFar - 1);
      const lineTotal = paidQty * getUnitPrice(item);
      dipQtySoFar += qty;
      dipExtra += lineTotal;
      total += lineTotal;
      return lineTotal;
    }
    const lineTotal = getUnitPrice(item) * qty;
    total += lineTotal;
    return lineTotal;
  });

  return { lineTotals, total, dipExtra };
}

export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lang, setLang] = useState<Lang>("de");
  const [clientPlatform, setClientPlatform] = useState<ClientPlatform>("other");

  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [paymentAvailability, setPaymentAvailability] = useState<{
    cashEnabled: boolean;
    cardEnabled: boolean;
    cashlessEnabled: boolean;
  }>({
    cashEnabled: true,
    cardEnabled: true,
    cashlessEnabled: true,
  });
  const [customerName, setCustomerName] = useState("");
  const [eventId, setEventId] = useState("");
  const [eventName, setEventName] = useState("");
  const [reserveOrder, setReserveOrder] = useState(false);
  const [reservationTime, setReservationTime] = useState("");

  const [order, setOrder] = useState<Order | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [hasAutoPrinted, setHasAutoPrinted] = useState(false);
  const prevOrderStatus = useRef<OrderStatus | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);


  useEffect(() => {
    setLang(getSavedLang());
    setClientPlatform(detectClientPlatform());
    setCart(getCart());
    const savedEventId = localStorage.getItem(EVENT_ID_KEY);
    const savedEvent = localStorage.getItem(EVENT_NAME_KEY);
    if (savedEventId && savedEventId.trim()) {
      setEventId(savedEventId.trim());
    }
    if (savedEvent && savedEvent.trim()) {
      setEventName(savedEvent.trim());
    } else if (DEFAULT_EVENT_NAME.trim()) {
      setEventName(DEFAULT_EVENT_NAME.trim());
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPaymentConfig() {
      try {
        const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
        const res = await fetch(`/api/menu-config${query}`, { cache: "no-store" });
        const data = (await res.json()) as {
          ok?: boolean;
          sections?: Array<{ items?: Array<{ id?: string; price?: number }> }>;
          paymentConfig?: { cashEnabled?: boolean; cardEnabled?: boolean; cashlessEnabled?: boolean };
          storeConfig?: { activeEventId?: string; activeEventName?: string; events?: Array<{ id?: string; name?: string }> };
          selectedEvent?: { id?: string; name?: string } | null;
        };
        if (!res.ok || !data?.ok || cancelled) return;
        const next = {
          cashEnabled: data.paymentConfig?.cashEnabled !== false,
          cardEnabled: data.paymentConfig?.cardEnabled !== false,
          cashlessEnabled: data.paymentConfig?.cashlessEnabled !== false,
        };
        setPaymentAvailability(next);
        const selected = data.selectedEvent;
        if (selected?.id && selected?.name) {
          setEventId(String(selected.id));
          setEventName(String(selected.name));
          localStorage.setItem(EVENT_ID_KEY, String(selected.id));
          localStorage.setItem(EVENT_NAME_KEY, String(selected.name));
        }
        const currentLocal = localStorage.getItem(EVENT_NAME_KEY);
        if (!currentLocal?.trim() && !selected?.id) {
          const adminDefault = String(data.storeConfig?.activeEventName || "").trim();
          if (adminDefault) {
            setEventName(adminDefault);
            localStorage.setItem(EVENT_NAME_KEY, adminDefault);
          }
          const adminDefaultId = String(data.storeConfig?.activeEventId || "").trim();
          if (adminDefaultId) {
            setEventId(adminDefaultId);
            localStorage.setItem(EVENT_ID_KEY, adminDefaultId);
          }
        }
        if (!selected?.id && !eventId && !String(data.storeConfig?.activeEventId || "").trim()) {
          window.location.href = "/";
        }

        const priceById = new Map<string, number>();
        for (const section of Array.isArray(data.sections) ? data.sections : []) {
          for (const item of Array.isArray(section.items) ? section.items : []) {
            const id = String(item?.id || "").trim();
            const price = Number(item?.price);
            if (id && Number.isFinite(price)) priceById.set(id, price);
          }
        }
        if (priceById.size > 0) {
          const current = getCart();
          let changed = false;
          const repriced = current.map((it) => {
            const nextPrice = priceById.get(it.id);
            if (typeof nextPrice === "number" && Number.isFinite(nextPrice) && nextPrice !== it.price) {
              changed = true;
              return { ...it, price: nextPrice };
            }
            return it;
          });
          if (changed) {
            replaceCart(repriced);
            setCart(repriced);
          }
        }
      } catch {
        // keep defaults
      }
    }

    void loadPaymentConfig();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    const firstAvailable = paymentAvailability.cashEnabled
      ? "cash"
      : paymentAvailability.cardEnabled
      ? "card"
      : paymentAvailability.cashlessEnabled
      ? "cashless"
      : null;

    if (payment === "cash" && !paymentAvailability.cashEnabled && firstAvailable) {
      setPayment(firstAvailable);
    }
    if (payment === "card" && !paymentAvailability.cardEnabled && firstAvailable) {
      setPayment(firstAvailable);
    }
    if (payment === "cashless" && !paymentAvailability.cashlessEnabled && firstAvailable) {
      setPayment(firstAvailable);
    }
  }, [payment, paymentAvailability]);

  useEffect(() => {
    if (order && orderStatus === "READY" && prevOrderStatus.current !== "READY" && !hasAutoPrinted) {
      window.print();
      setHasAutoPrinted(true);
    }
    prevOrderStatus.current = orderStatus;
  }, [order, orderStatus, hasAutoPrinted]);

  const t = translations[lang];
  const cardPaymentHintText = getCardPaymentHintText(lang, clientPlatform);
  const cartBreakdown = useMemo(() => getCartBreakdown(cart), [cart]);
  const total = cartBreakdown.total;
  const dipExtra = cartBreakdown.dipExtra;
  const ticketBreakdown = useMemo(
    () => (order ? getTicketBreakdown(order.items) : { lineTotals: [], total: 0 }),
    [order]
  );

  function refreshCart() {
    setCart(getCart());
  }

  async function createOrderInDb(pay: PaymentMethod) {
    try {
      if (pay === "cash" && !paymentAvailability.cashEnabled) {
        throw new Error(
          lang === "fr" ? "Paiement cash desactive" : lang === "de" ? "Barzahlung deaktiviert" : "Cash payment disabled"
        );
      }
      if (pay === "card" && !paymentAvailability.cardEnabled) {
        throw new Error(
          lang === "fr" ? "Paiement carte desactive" : lang === "de" ? "Kartenzahlung deaktiviert" : "Card payment disabled"
        );
      }
      if (pay === "cashless" && !paymentAvailability.cashlessEnabled) {
        throw new Error(
          lang === "fr" ? "Paiement cashless desactive" : lang === "de" ? "Cashless-Zahlung deaktiviert" : "Cashless payment disabled"
        );
      }
      if (reserveOrder && !eventName.trim()) {
        throw new Error(t.cart_reserve_missing_event);
      }
      if (reserveOrder && !reservationTime.trim()) {
        throw new Error(t.cart_reserve_missing_time);
      }
      setIsCreating(true);
      setApiError(null);

      const payload: Order = {
        id: makeOrderId(),
        createdAt: new Date().toISOString(),
        customerName: customerName.trim() ? customerName.trim() : undefined,
        eventId: eventId.trim() ? eventId.trim() : undefined,
        eventName: eventName.trim() ? eventName.trim() : undefined,
        reservationRequested: reserveOrder,
        reservationTime: reserveOrder && reservationTime.trim() ? new Date(reservationTime).toISOString() : undefined,
        items: cartToTicketItems(getCart()),
        payment: pay,
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || t.cart_api_error_default);
      }

      const created = data.order as Order;
      setOrder(created);
      setOrderStatus("PENDING_PAYMENT");
      localStorage.setItem(LAST_ORDER_KEY, created.id);
    } catch (err: unknown) {
      setApiError(getErrorMessage(err, t.cart_unknown_error));
    } finally {
      setIsCreating(false);
    }
  }

  const checkOrderStatus = useCallback(async (orderId?: string) => {
    const id = orderId || order?.id;
    if (!id) return;

    try {
      setIsCheckingStatus(true);
      setApiError(null);

      const res = await fetch(`/api/orders?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await res.json();

      const row = Array.isArray(data) && data.length > 0 ? (data[0] as OrderRow) : null;
      if (!row) {
        throw new Error(t.cart_not_found);
      }

      setOrder(mapRowToOrder(row));
      setOrderStatus(row.status);
    } catch (err: unknown) {
      setApiError(getErrorMessage(err, t.cart_unknown_error));
    } finally {
      setIsCheckingStatus(false);
    }
  }, [order?.id, t.cart_not_found, t.cart_unknown_error]);

  useEffect(() => {
    const lastOrderId = localStorage.getItem(LAST_ORDER_KEY);
    if (lastOrderId) {
      checkOrderStatus(lastOrderId);
    }
  }, [checkOrderStatus]);

  useEffect(() => {
    return subscribeOrderSync((message) => {
      if (!order?.id) return;
      if (message.orderId && message.orderId !== order.id) return;
      if (
        message.reason === "PAYMENT_VALIDATED" ||
        message.reason === "ORDER_READY" ||
        message.reason === "ORDER_DONE" ||
        message.reason === "ORDER_STATUS_CHANGED"
      ) {
        checkOrderStatus(order.id);
      }
    });
  }, [order?.id, checkOrderStatus]);

  function printTicket() {
    window.print();
  }

  const confirmButtonStyle = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #111",
    background:
      orderStatus === "NEW" || orderStatus === "READY"
        ? "linear-gradient(135deg,#16a34a,#15803d)"
        : orderStatus === "PENDING_PAYMENT" || isCreating
        ? "linear-gradient(135deg,#f59e0b,#d97706)"
        : "#111",
    color: "white",
    fontWeight: 900,
    opacity: isCreating ? 0.8 : 1,
    cursor: isCreating ? "not-allowed" : "pointer",
  } as const;

  return (
    <main
      className="af-page"
      style={UI.page}
    >
      <div className="af-topbar" style={UI.topbar}>
        <button type="button" onClick={() => goBackOr("/menu")} className="af-back af-link-btn">
          {t.cart_back}
        </button>

        <div className="af-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {(["de", "fr", "en"] as Lang[]).map((L) => (
            <button
              key={L}
              onClick={() => {
                setLang(L);
                saveLang(L);
              }}
              className={`af-lang-btn ${lang === L ? "is-active" : ""}`}
              type="button"
            >
              {L.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="af-brand" style={UI.brand}>
          <img
            src="/logo-afrofood.png"
            alt="AfroFood"
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              objectFit: "cover",
              border: `1px solid ${BRAND.border}`,
              boxShadow: "0 6px 16px rgba(15,23,42,0.08)",
            }}
          />
          <div>
            <h1 style={UI.title}>
              {t.cart_title}
            </h1>
            <div style={UI.subtitle}>{t.cart_payment_title}</div>
          </div>
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

      {cart.length === 0 ? (
        <section style={UI.section} className="af-section">
          <h2 style={UI.sectionTitle}>{t.cart_title}</h2>
          <p style={{ margin: "14px 0 0", color: "#5f5f5f", fontSize: 15 }}>
            {t.cart_empty ?? "Dein Warenkorb ist leer."}
          </p>
        </section>
      ) : (
        <>
          <section style={UI.section} className="af-section">
            <h2 style={UI.sectionTitle}>{t.cart_title}</h2>
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {cart.map((it, idx) => (
              <div
                key={it.id}
                className="af-card"
                style={UI.card}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.2 }}>{it.name}</div>

	                  <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button type="button" className="af-btn" onClick={() => { decrementItem(it.id); refreshCart(); }} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #111", background: "rgba(255,255,255,0.96)", cursor: "pointer", color: BRAND.black }}>
                      -
                    </button>
                    <div style={{ minWidth: 90, textAlign: "center", fontWeight: 800, padding: "6px 12px", borderRadius: 999, border: "1px solid #111", background: "rgba(255,255,255,0.7)" }}>
                      x{it.qty}
                    </div>
                    <button type="button" className="af-btn" onClick={() => { incrementItem(it.id); refreshCart(); }} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #111", background: "rgba(255,255,255,0.96)", cursor: "pointer", color: BRAND.black }}>
                      +
                    </button>
	                    <button type="button" className="af-btn" onClick={() => { removeItem(it.id); refreshCart(); }} style={{ marginLeft: 10, padding: "6px 12px", borderRadius: 999, border: "1px solid #111", background: "rgba(255,255,255,0.96)", cursor: "pointer", color: BRAND.black }}>
	                      {t.cart_remove}
	                    </button>
	                  </div>

                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      <label style={{ display: "block", fontWeight: 700, marginBottom: 0 }}>
                        {t.cart_item_note_label}
                      </label>
                      {Array.from({ length: it.qty }).map((_, noteIndex) => (
                        <div key={`${it.id}-note-${noteIndex}`} style={{ display: "grid", gap: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#7a4b2f" }}>
                            {t.cart_item_note_portion} {noteIndex + 1}
                          </div>
                          <textarea
                            value={it.unitNotes?.[noteIndex] || ""}
                            onChange={(e) => {
                              updateItemUnitNote(it.id, noteIndex, e.target.value);
                              refreshCart();
                            }}
                            placeholder={t.cart_item_note_placeholder}
                            rows={2}
                            style={{
                              ...UI.input,
                              minHeight: 70,
                              resize: "vertical",
                              fontFamily: "inherit",
                            }}
                          />
                        </div>
                      ))}
                    </div>
	                </div>

                <div className="af-price" style={{ fontSize: 22, fontWeight: 900, color: BRAND.black, whiteSpace: "nowrap", letterSpacing: -0.3 }}>
                  {(cartBreakdown.lineTotals[idx] ?? 0).toFixed(2)} EUR
                </div>
              </div>
            ))}
            </div>

            {dipExtra > 0 ? (
              <div style={{ ...UI.notice, borderColor: "#ffd2b8", background: "#fff3e8", fontWeight: 600 }}>
                {t.cart_dips_extra}: <b>{dipExtra.toFixed(2)} EUR</b> {t.cart_dips_note}
              </div>
            ) : null}

            <h2 style={{ marginTop: 24, fontSize: 30, fontWeight: 900, color: BRAND.black, letterSpacing: -0.4 }}>
              {t.cart_total}: <span style={{ color: "#ff6500" }}>{total.toFixed(2)} EUR</span>
            </h2>

            <button
              className="af-btn"
              onClick={() => {
                clearCart();
                setCart([]);
                setOrder(null);
                setOrderStatus(null);
                localStorage.removeItem(LAST_ORDER_KEY);
              }}
              style={{
                marginTop: 14,
                padding: "13px 20px",
                borderRadius: 999,
                border: "none",
                background: "linear-gradient(180deg, #ff8a1f, #ff6500)",
                color: "white",
                fontWeight: 900,
                cursor: "pointer",
                boxShadow: "0 16px 34px rgba(242,140,40,0.30)",
              }}
              type="button"
            >
              {t.cart_clear}
            </button>
          </section>

          <section style={UI.section} className="af-section">
          <h2 style={UI.sectionTitle}>{t.cart_payment_title}</h2>

          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {paymentAvailability.cashEnabled ? (
              <label style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderRadius: 16, background: "rgba(255,250,246,0.92)", border: "1px solid #F1D7C8" }}>
                <input type="radio" name="pay" checked={payment === "cash"} onChange={() => setPayment("cash")} />
                {t.cart_payment_cash}
              </label>
            ) : null}
            {paymentAvailability.cardEnabled ? (
              <label style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderRadius: 16, background: "rgba(255,250,246,0.92)", border: "1px solid #F1D7C8" }}>
                <input type="radio" name="pay" checked={payment === "card"} onChange={() => setPayment("card")} />
                {t.cart_payment_card}
              </label>
            ) : null}
            {paymentAvailability.cashlessEnabled ? (
              <label style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderRadius: 16, background: "rgba(255,250,246,0.92)", border: "1px solid #F1D7C8" }}>
                <input type="radio" name="pay" checked={payment === "cashless"} onChange={() => setPayment("cashless")} />
                {t.cart_payment_cashless}
              </label>
            ) : null}
            {!paymentAvailability.cashEnabled && !paymentAvailability.cardEnabled && !paymentAvailability.cashlessEnabled ? (
              <div style={{ color: "#b91c1c", fontWeight: 700 }}>
                {lang === "fr"
                  ? "Aucun mode de paiement disponible."
                  : lang === "de"
                  ? "Keine Zahlungsart verfugbar."
                  : "No payment method available."}
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>{t.cart_name_label}</label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder={t.cart_name_placeholder}
              style={UI.input}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
              {lang === "de" ? "Event / Markt" : lang === "fr" ? "Evenement / Marche" : "Event / Market"}
            </label>
            <div
              style={{
                ...UI.input,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span>{eventName || "-"}</span>
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/";
                }}
                style={{
                  border: "1px solid #111",
                  background: "white",
                  color: "#111",
                  borderRadius: 999,
                  padding: "6px 12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {lang === "fr" ? "Changer" : lang === "de" ? "Wechseln" : "Change"}
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              padding: "14px 16px",
              borderRadius: 18,
              border: "1px solid #F1D7C8",
              background: "rgba(255,250,246,0.92)",
              display: "grid",
              gap: 10,
            }}
          >
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontWeight: 800 }}>
              <input
                type="checkbox"
                checked={reserveOrder}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setReserveOrder(checked);
                  if (!checked) {
                    setReservationTime("");
                  }
                }}
                style={{ marginTop: 3 }}
              />
              <span>{t.cart_reserve_label}</span>
            </label>
            <div style={{ fontSize: 13, color: "#6b4d3b" }}>{t.cart_reserve_help}</div>
            {reserveOrder ? (
              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ display: "block", fontWeight: 700 }}>
                  {t.cart_reserve_time_label}
                </label>
                <input
                  type="datetime-local"
                  value={reservationTime}
                  onChange={(e) => setReservationTime(e.target.value)}
                  style={UI.input}
                />
                <div style={{ fontSize: 12, color: "#6b4d3b" }}>{t.cart_reserve_time_hint}</div>
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="af-btn" onClick={() => createOrderInDb(payment)} disabled={isCreating} style={confirmButtonStyle} type="button">
              {isCreating
                ? t.cart_creating
                : reserveOrder && orderStatus !== "NEW" && orderStatus !== "READY"
                ? t.cart_confirm_reservation_action
                : orderStatus === "NEW" || orderStatus === "READY"
                ? t.cart_confirmed
                : orderStatus === "PENDING_PAYMENT"
                ? t.cart_pending_cashier
                : t.cart_confirm_action}
            </button>

            {order ? (
              <button
                type="button"
                onClick={() => checkOrderStatus()}
                disabled={isCheckingStatus}
                style={{
                  padding: "11px 16px",
                  borderRadius: 999,
                  border: "1px solid #111",
                  background: isCheckingStatus ? "rgba(148,163,184,0.88)" : "rgba(255,255,255,0.96)",
                  color: BRAND.black,
                  fontWeight: 900,
                  cursor: isCheckingStatus ? "not-allowed" : "pointer",
                }}
              >
                {isCheckingStatus ? t.cart_checking : t.cart_check_status}
              </button>
            ) : null}
          </div>

          {orderStatus === "PENDING_PAYMENT" ? (
            <div style={{ ...UI.notice, borderColor: "#f59e0b", background: "#fff7ed", color: "#9a3412", fontWeight: 700 }}>
              {order?.reservationRequested ? t.cart_pending_reservation_message : t.cart_pending_message}
            </div>
          ) : null}

          {apiError ? (
            <div style={{ ...UI.notice, borderColor: "#f3b6b6", background: "#fff3f3", color: "#9c1f1f", fontWeight: 700 }}>
              {t.cart_api_error}: {apiError}
            </div>
          ) : null}

          {payment === "card" ? (
            <div style={{ ...UI.notice, background: "rgba(255,255,255,0.92)" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>{t.cart_card_hint_title}</div>
              <div style={{ opacity: 0.9 }}>
                {cardPaymentHintText}
              </div>
            </div>
          ) : null}
          {payment === "cashless" ? (
            <div style={{ ...UI.notice, background: "rgba(255,255,255,0.92)" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>{t.cart_cashless_hint_title}</div>
              <div style={{ opacity: 0.9 }}>
                {t.cart_cashless_hint_text}
              </div>
            </div>
          ) : null}
          </section>

          {order && (orderStatus === "NEW" || orderStatus === "READY" || orderStatus === "CANCELED") ? (
            <section style={UI.section} className="af-section">
            <div className="af-ticket-wrap af-ticket-area af-ticket-customer" style={{ marginTop: 0 }}>
              <div className="af-ticket">
                <div className="af-ticket-head">
                  <img className="af-ticket-logo" src="/logo-afrofood.png" alt="AfroFood" />
                  <div className="af-ticket-title">{t.cart_ticket_title}</div>
                  <div className="af-ticket-sub">
                    {orderStatus === "CANCELED" ? t.cart_ticket_canceled : t.cart_ticket_paid}
                  </div>
                </div>

                <div className="af-ticket-meta">
                  <div><b>{t.cart_ticket_order}:</b> {order.id}</div>
                  <div><b>{t.cart_ticket_name}:</b> {order.customerName || "-"}</div>
                  {order.eventName ? (
                    <div>
                      <b>{lang === "de" ? "Event" : lang === "fr" ? "Evenement" : "Event"}:</b> {order.eventName}
                    </div>
                  ) : null}
                  {order.reservationRequested ? (
                    <div>
                      <b>{t.cart_ticket_reservation}:</b> {lang === "fr" ? "Oui" : lang === "de" ? "Ja" : "Yes"}
                    </div>
                  ) : null}
                  {order.reservationTime ? (
                    <div>
                      <b>{t.cart_ticket_pickup_time}:</b> {formatReservationDateTime(order.reservationTime, lang)}
                    </div>
                  ) : null}
                </div>

                <div className="af-ticket-items">
	                  {order.items.map((it, idx) => (
	                    <div key={idx} className="af-ticket-row">
	                      <div className="af-ticket-name">{it.name}</div>
	                      <div className="af-ticket-qty">
	                        x{it.qty} - {(ticketBreakdown.lineTotals[idx] ?? 0).toFixed(2)} EUR
	                      </div>
                        {it.note ? (
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
                            <b>{lang === "fr" ? "Remarque" : lang === "de" ? "Bemerkung" : "Note"}:</b> {it.note}
                          </div>
                        ) : null}
                        {Array.isArray(it.unitNotes) && it.unitNotes.some((note) => String(note || "").trim()) ? (
                          <div style={{ marginTop: 4, display: "grid", gap: 2, fontSize: 12, opacity: 0.85 }}>
                            {it.unitNotes.map((note, noteIndex) =>
                              String(note || "").trim() ? (
                                <div key={`${idx}-unit-note-${noteIndex}`}>
                                  <b>{t.cart_item_note_portion} {noteIndex + 1}:</b> {note}
                                </div>
                              ) : null
                            )}
                          </div>
                        ) : null}
	                    </div>
	                  ))}
                </div>

                <div className="af-ticket-meta">
                  <div>
                    <b>Total:</b> {ticketBreakdown.total.toFixed(2)} EUR
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{t.legend_details}</div>
                </div>

                <div className="af-ticket-qr">
                  <QRCodeCanvas
                    value={
                      orderStatus === "CANCELED"
                        ? `${makeQrPayload(order)}\nSTATUS:CANCELED`
                        : makeQrPayload(order)
                    }
                    size={72}
                  />
                  <div className="af-ticket-qrtext">
                    {orderStatus === "CANCELED" ? t.cart_ticket_canceled_note : t.cart_ticket_sent}
                  </div>
                </div>

                <div className="af-ticket-foot">
                  {orderStatus === "CANCELED" ? t.cart_ticket_canceled_note : t.cart_ticket_thanks}
                </div>
              </div>

              <button
                onClick={printTicket}
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #111", background: "#111", color: "white", fontWeight: 900, cursor: "pointer" }}
                type="button"
              >
                {t.cart_print}
              </button>
            </div>
            </section>
          ) : null}

        </>
      )}
    </main>
  );
}
