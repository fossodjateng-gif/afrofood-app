"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { translations, type Lang, getSavedLang, saveLang } from "@/lib/translations";
import { makeOrderId, cartToTicketItems, makeQrPayload, type PaymentMethod, type Order } from "@/lib/order";
import { QRCodeCanvas } from "qrcode.react";
import {
  getCart,
  clearCart,
  incrementItem,
  decrementItem,
  removeItem,
  type CartItem,
} from "@/lib/cart";
import type { OrderRow, OrderStatus } from "@/lib/schema";
import { subscribeOrderSync } from "@/lib/order-sync";

const LAST_ORDER_KEY = "af_last_order_id";
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur inconnue";
}

function mapRowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    createdAt: row.created_at,
    customerName: row.customer_name || undefined,
    payment: row.payment,
    items: Array.isArray(row.items) ? row.items : [],
  };
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
      lineTotal = paidQty * 1;
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
      const lineTotal = paidQty * 1;
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

  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [customerName, setCustomerName] = useState("");

  const [order, setOrder] = useState<Order | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const PAYPAL_EMAIL = process.env.NEXT_PUBLIC_PAYPAL_EMAIL || "";
  const BANK_IBAN = process.env.NEXT_PUBLIC_BANK_IBAN || "";
  const BANK_NAME = process.env.NEXT_PUBLIC_BANK_NAME || "";
  const PAYEE_NAME = process.env.NEXT_PUBLIC_PAYEE_NAME || "";

  useEffect(() => {
    setLang(getSavedLang());
    setCart(getCart());
  }, []);

  const t = translations[lang];
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
      setIsCreating(true);
      setApiError(null);

      const payload: Order = {
        id: makeOrderId(),
        createdAt: new Date().toISOString(),
        customerName: customerName.trim() ? customerName.trim() : undefined,
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
        throw new Error(data?.error || "Erreur API");
      }

      const created = data.order as Order;
      setOrder(created);
      setOrderStatus("PENDING_PAYMENT");
      localStorage.setItem(LAST_ORDER_KEY, created.id);
    } catch (err: unknown) {
      setApiError(getErrorMessage(err));
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
        throw new Error("Commande introuvable");
      }

      setOrder(mapRowToOrder(row));
      setOrderStatus(row.status);
    } catch (err: unknown) {
      setApiError(getErrorMessage(err));
    } finally {
      setIsCheckingStatus(false);
    }
  }, [order?.id]);

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
        message.reason === "ORDER_DONE"
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
      style={{
        padding: 24,
        fontFamily: "Arial, sans-serif",
        maxWidth: 1000,
        margin: "0 auto",
        backgroundColor: "#FFF3E6",
        backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "cover, min(64vw, 420px)",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <a href="/menu" style={{ textDecoration: "none", fontWeight: 800 }}>
          {t.cart_back}
        </a>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {(["de", "fr", "en"] as Lang[]).map((L) => (
            <button
              key={L}
              onClick={() => {
                setLang(L);
                saveLang(L);
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #111",
                background: lang === L ? "#111" : "white",
                color: lang === L ? "white" : "#111",
                cursor: "pointer",
                fontWeight: 800,
              }}
              type="button"
            >
              {L.toUpperCase()}
            </button>
          ))}
        </div>

        <h1 style={{ margin: 0, width: "100%" }}>{t.cart_title}</h1>
      </div>

      {cart.length === 0 ? (
        <p>{t.cart_empty ?? "Dein Warenkorb ist leer."}</p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {cart.map((it, idx) => (
              <div
                key={it.id}
                className="af-card"
                style={{
                  border: "1px solid #ffd2b8",
                  borderRadius: 18,
                  padding: 18,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  background: "white",
                  boxShadow: "0 12px 30px rgba(255, 120, 0, 0.08)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{it.name}</div>

                  <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button type="button" className="af-btn" onClick={() => { decrementItem(it.id); refreshCart(); }} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #000", background: "white", cursor: "pointer" }}>
                      -
                    </button>
                    <div style={{ minWidth: 90, textAlign: "center", fontWeight: 800, padding: "4px 10px", borderRadius: 999, border: "1px solid #ddd", background: "#f7f7f7" }}>
                      x{it.qty}
                    </div>
                    <button type="button" className="af-btn" onClick={() => { incrementItem(it.id); refreshCart(); }} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #000", background: "white", cursor: "pointer" }}>
                      +
                    </button>
                    <button type="button" className="af-btn" onClick={() => { removeItem(it.id); refreshCart(); }} style={{ marginLeft: 10, padding: "4px 10px", borderRadius: 8, border: "1px solid #000", background: "white", cursor: "pointer" }}>
                      Suppr
                    </button>
                  </div>
                </div>

                <div className="af-price" style={{ fontSize: 20, fontWeight: 900, color: "#ff4d00", whiteSpace: "nowrap" }}>
                  {(cartBreakdown.lineTotals[idx] ?? 0).toFixed(2)} EUR
                </div>
              </div>
            ))}
          </div>

          {dipExtra > 0 ? (
            <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 14, background: "#fff3e8", border: "1px solid #ffd2b8", fontWeight: 600 }}>
              {t.cart_dips_extra}: <b>{dipExtra.toFixed(2)} EUR</b> {t.cart_dips_note}
            </div>
          ) : null}

          <h2 style={{ marginTop: 28, fontSize: 28, fontWeight: 900, color: "#111" }}>
            {t.cart_total}: <span style={{ color: "#ff4d00" }}>{total.toFixed(2)} EUR</span>
          </h2>

          <hr style={{ margin: "18px 0", border: "none", borderTop: "1px solid #eee" }} />
          <h2 style={{ marginTop: 6 }}>Zahlung</h2>

          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="radio" name="pay" checked={payment === "cash"} onChange={() => setPayment("cash")} />Barzahlung (Cash)</label>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="radio" name="pay" checked={payment === "paypal"} onChange={() => setPayment("paypal")} />PayPal</label>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="radio" name="pay" checked={payment === "card"} onChange={() => setPayment("card")} />EC/Kreditkarte (vor Ort)</label>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Name (optional)</label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="z.B. Anaclet"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd" }}
            />
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {payment === "paypal" ? (
              <a
                className="af-btn"
                href={
                  PAYPAL_EMAIL
                    ? `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(PAYPAL_EMAIL)}&item_name=${encodeURIComponent("AfroFood Bestellung")}&currency_code=EUR&amount=${encodeURIComponent(total.toFixed(2))}`
                    : "#"
                }
                target="_blank"
                rel="noreferrer"
                style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #111", background: "#F28C28", color: "#111", fontWeight: 900, textDecoration: "none" }}
                onClick={(e) => {
                  if (!PAYPAL_EMAIL) {
                    e.preventDefault();
                    alert("PayPal Email fehlt (ENV).");
                  }
                }}
              >
                Ouvrir PayPal ({total.toFixed(2)} EUR)
              </a>
            ) : null}

            <button className="af-btn" onClick={() => createOrderInDb(payment)} disabled={isCreating} style={confirmButtonStyle} type="button">
              {isCreating
                ? "Enregistrement..."
                : orderStatus === "NEW" || orderStatus === "READY"
                ? "Commande validee"
                : orderStatus === "PENDING_PAYMENT"
                ? "En attente de validation caisse"
                : "Bestellung bestatigen"}
            </button>

            {order ? (
              <button
                type="button"
                onClick={() => checkOrderStatus()}
                disabled={isCheckingStatus}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #0f172a",
                  background: isCheckingStatus ? "#94a3b8" : "#e2e8f0",
                  color: "#0f172a",
                  fontWeight: 900,
                  cursor: isCheckingStatus ? "not-allowed" : "pointer",
                }}
              >
                {isCheckingStatus ? "Verification..." : "Verifier validation caisse"}
              </button>
            ) : null}
          </div>

          {orderStatus === "PENDING_PAYMENT" ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #f59e0b", background: "#fff7ed", color: "#9a3412", fontWeight: 700 }}>
              Commande en attente de validation caisse.
            </div>
          ) : null}

          {apiError ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #f3b6b6", background: "#fff3f3", color: "#9c1f1f", fontWeight: 700 }}>
              Erreur API: {apiError}
            </div>
          ) : null}

          {payment === "card" ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #eee", background: "white" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Hinweis</div>
              <div style={{ opacity: 0.9 }}>
                Paiement carte au terminal sur place.
                <br />
                {BANK_IBAN ? (
                  <div style={{ marginTop: 8 }}>
                    <b>Beneficiaire:</b> {PAYEE_NAME || "AfroFood"}
                    <br />
                    <b>Bank:</b> {BANK_NAME || "-"}
                    <br />
                    <b>IBAN:</b> {BANK_IBAN}
                  </div>
                ) : (
                  <div style={{ marginTop: 8, color: "#b00" }}>IBAN manquant (ENV).</div>
                )}
              </div>
            </div>
          ) : null}

          {order && (orderStatus === "NEW" || orderStatus === "READY") ? (
            <div className="af-ticket-wrap af-ticket-area af-ticket-customer" style={{ marginTop: 18 }}>
              <div className="af-ticket">
                <div className="af-ticket-head">
                  <img className="af-ticket-logo" src="/logo-afrofood.png" alt="AfroFood" />
                  <div className="af-ticket-title">Ticket Client</div>
                  <div className="af-ticket-sub">Paiement valide en caisse</div>
                </div>

                <div className="af-ticket-meta">
                  <div><b>Commande:</b> {order.id}</div>
                  <div><b>Nom:</b> {order.customerName || "-"}</div>
                </div>

                <div className="af-ticket-items">
                  {order.items.map((it, idx) => (
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
                    <b>Total:</b> {ticketBreakdown.total.toFixed(2)} EUR
                  </div>
                </div>

                <div className="af-ticket-qr">
                  <QRCodeCanvas value={makeQrPayload(order)} size={72} />
                  <div className="af-ticket-qrtext">Commande envoyee en cuisine</div>
                </div>

                <div className="af-ticket-foot">Merci et bon appetit</div>
              </div>

              <button
                onClick={printTicket}
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #111", background: "#111", color: "white", fontWeight: 900, cursor: "pointer" }}
                type="button"
              >
                Imprimer ticket
              </button>
            </div>
          ) : null}

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
              marginTop: 16,
              padding: "12px 20px",
              borderRadius: 999,
              border: "none",
              background: "linear-gradient(135deg, #ff7a00, #ff3c00)",
              color: "white",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 8px 20px rgba(255,80,0,0.35)",
            }}
            type="button"
          >
            {t.cart_clear}
          </button>
        </>
      )}
    </main>
  );
}
