"use client";

import { useEffect, useMemo, useState } from "react";
import {
  translations,
  type Lang,
  getSavedLang,
  saveLang,
} from "@/lib/translations";

import {
  makeOrderId,
  cartToTicketItems,
  makeQrPayload,
  type PaymentMethod,
  type Order,
} from "@/lib/order";

import { QRCodeCanvas } from "qrcode.react";


import {
  getCart,
  cartTotal,
  clearCart,
  incrementItem,
  decrementItem,
  removeItem,
  type CartItem,
} from "@/lib/cart";

export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lang, setLang] = useState<Lang>("de");

  // Paiement + commande
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [customerName, setCustomerName] = useState("");
  const [order, setOrder] = useState<Order | null>(null);

  // ENV (affichées seulement si tu veux)
  const PAYPAL_EMAIL = process.env.NEXT_PUBLIC_PAYPAL_EMAIL || "";
  const BANK_IBAN = process.env.NEXT_PUBLIC_BANK_IBAN || "";
  const BANK_NAME = process.env.NEXT_PUBLIC_BANK_NAME || "";
  const PAYEE_NAME = process.env.NEXT_PUBLIC_PAYEE_NAME || "";

  // Lang au chargement
  useEffect(() => {
    setLang(getSavedLang());
  }, []);

  // Cart au chargement
  useEffect(() => {
    setCart(getCart());
  }, []);

  const t = translations[lang];

  const total = useMemo(() => cartTotal(cart), [cart]);

  const dipQtyTotal = useMemo(
    () =>
      cart
        .filter((it) => it.id.startsWith("dip-"))
        .reduce((sum, it) => sum + it.qty, 0),
    [cart]
  );

  const dipExtra = useMemo(() => Math.max(0, dipQtyTotal - 1) * 1, [dipQtyTotal]);

  function refreshCart() {
    setCart(getCart());
  }

const [isCreating, setIsCreating] = useState(false);
const [apiError, setApiError] = useState<string | null>(null);

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

    setOrder(data.order as Order);
    return data.order as Order;
  } catch (err: any) {
    setApiError(err?.message || "Erreur inconnue");
    return null;
  } finally {
    setIsCreating(false);
  }
}

  function printTicket() {
    window.print();
  }

  return (
    <main
      className="af-page"
      style={{
        padding: 40,
        fontFamily: "Arial, sans-serif",
        maxWidth: 1000,
        margin: "0 auto",
        background: "linear-gradient(180deg, #fff5ec 0%, #ffe9dc 100%)",
        minHeight: "100vh",
      }}
    >
      {/* HEADER */}
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

      {/* EMPTY */}
      {cart.length === 0 ? (
        <p>{t.cart_empty ?? "Dein Warenkorb ist leer."}</p>
      ) : (
        <>
          {/* LIST */}
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {cart.map((it) => (
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
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{it.name}</div>

                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      className="af-btn"
                      onClick={() => {
                        decrementItem(it.id);
                        refreshCart();
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 8,
                        border: "1px solid #000",
                        background: "white",
                        cursor: "pointer",
                      }}
                      type="button"
                    >
                      −
                    </button>

                    <div
                      style={{
                        minWidth: 90,
                        textAlign: "center",
                        fontWeight: 800,
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid #ddd",
                        background: "#f7f7f7",
                      }}
                    >
                      x{it.qty}
                    </div>

                    <button
                      className="af-btn"
                      onClick={() => {
                        incrementItem(it.id);
                        refreshCart();
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 8,
                        border: "1px solid #000",
                        background: "white",
                        cursor: "pointer",
                      }}
                      type="button"
                    >
                      +
                    </button>

                    <button
                      className="af-btn"
                      onClick={() => {
                        removeItem(it.id);
                        refreshCart();
                      }}
                      style={{
                        marginLeft: 10,
                        padding: "4px 10px",
                        borderRadius: 8,
                        border: "1px solid #000",
                        background: "white",
                        cursor: "pointer",
                      }}
                      type="button"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <div
                  className="af-price"
                  style={{
                    fontSize: 20,
                    fontWeight: 900,
                    color: "#ff4d00",
                    whiteSpace: "nowrap",
                  }}
                >
                  {it.id.startsWith("dip-")
                    ? (Math.max(0, it.qty - 1) * 1).toFixed(2)
                    : (it.price * it.qty).toFixed(2)}{" "}
                  €
                </div>
              </div>
            ))}
          </div>

          {dipExtra > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: "12px 16px",
                borderRadius: 14,
                background: "#fff3e8",
                border: "1px solid #ffd2b8",
                fontWeight: 600,
              }}
            >
              {t.cart_dips_extra}: <b>{dipExtra.toFixed(2)} €</b>{" "}
              {t.cart_dips_note}
            </div>
          )}

          {/* ✅ 1) TOTAL */}
          <h2
            style={{
              marginTop: 28,
              fontSize: 28,
              fontWeight: 900,
              color: "#111",
            }}
          >
            {t.cart_total}:{" "}
            <span style={{ color: "#ff4d00" }}> {total.toFixed(2)} €</span>
          </h2>

          {/* ✅ 2) PAIEMENT */}
          <hr
            style={{
              margin: "18px 0",
              border: "none",
              borderTop: "1px solid #eee",
            }}
          />

          <h2 style={{ marginTop: 6 }}>Zahlung</h2>

          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="radio"
                name="pay"
                checked={payment === "cash"}
                onChange={() => setPayment("cash")}
              />
              Barzahlung (Cash)
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="radio"
                name="pay"
                checked={payment === "paypal"}
                onChange={() => setPayment("paypal")}
              />
              PayPal
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="radio"
                name="pay"
                checked={payment === "card"}
                onChange={() => setPayment("card")}
              />
              EC/Kreditkarte (vor Ort) / Banküberweisung
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
              Name (optional)
            </label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="z.B. Anaclet"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ddd",
              }}
            />
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {payment === "cash" && (
<button
  className="af-btn"
  onClick={() => createOrderInDb("cash")}
  disabled={isCreating}
  style={{
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #111",
    background: "#111",
    color: "white",
    fontWeight: 900,
    cursor: isCreating ? "not-allowed" : "pointer",
    opacity: isCreating ? 0.7 : 1,
  }}
  type="button"
>
                ✅ Bestellung bestätigen (Cash) + Ticket
              </button>
            )}

            {payment === "paypal" && (
              <>
                <a
                  className="af-btn"
                  href={
                    PAYPAL_EMAIL
                      ? `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(
                          PAYPAL_EMAIL
                        )}&item_name=${encodeURIComponent(
                          "AfroFood Bestellung"
                        )}&currency_code=EUR&amount=${encodeURIComponent(total.toFixed(2))}`
                      : "#"
                  }
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #111",
                    background: "#F28C28",
                    color: "#111",
                    fontWeight: 900,
                    cursor: "pointer",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                  onClick={(e) => {
                    if (!PAYPAL_EMAIL) {
                      e.preventDefault();
                      alert("PayPal Email fehlt (ENV).");
                    }
                  }}
                >
                  💸 PayPal öffnen ({total.toFixed(2)} €)
                </a>

                <button
  className="af-btn"
  onClick={() => createOrderInDb("paypal")}
  disabled={isCreating}
  style={{
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #111",
    background: "#111",
    color: "white",
    fontWeight: 900,
    opacity: isCreating ? 0.7 : 1,
    cursor: isCreating ? "not-allowed" : "pointer",
  }}
  type="button"
>
  {isCreating
    ? "⏳ Bestellung wird gespeichert..."
    : "✅ Ich habe bezahlt → Ticket"}
</button>
              </>
            )}

            {payment === "card" && (
              <button
                className="af-btn"
                onClick={() => createOrderInDb("card")}
                disabled={isCreating}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #111",
                  background: "#111",
                  color: "white",
                  fontWeight: 900,
                  opacity: isCreating ? 0.7 : 1,
    cursor: isCreating ? "not-allowed" : "pointer",
  }}
  type="button"
>
  {isCreating
    ? "⏳ Bestellung wird gespeichert..."
    : "✅ Ich habe bezahlt → Ticket"}
              </button>
            )}
          </div>

          {payment === "card" && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                border: "1px solid #eee",
                background: "white",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Hinweis</div>
              <div style={{ opacity: 0.9 }}>
                ✅ Kartenzahlung erfolgt vor Ort am Terminal (EC/Kreditkarte).
                <br />
                Optional: Banküberweisung möglich (für Catering / Vorauszahlung).
                <br />
                {BANK_IBAN ? (
                  <div style={{ marginTop: 8 }}>
                    <b>Empfänger:</b> {PAYEE_NAME || "AfroFood"}
                    <br />
                    <b>Bank:</b> {BANK_NAME || "—"}
                    <br />
                    <b>IBAN:</b> {BANK_IBAN}
                  </div>
                ) : (
                  <div style={{ marginTop: 8, color: "#b00" }}>
                    IBAN fehlt (ENV).
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ✅ 3) TICKET (après paiement) */}
          {order && (
            <div
              className="af-ticket-wrap"
              style={{
                marginTop: 18,
                padding: 14,
                borderRadius: 14,
                border: "1px solid #ddd",
                background: "white",
              }}
            >
              <div className="af-ticket">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <img
                      src="/logo-afrofood.png"
                      alt="AfroFood"
                      style={{ width: 44, height: 44, objectFit: "contain" }}
                    />
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 18 }}>🧾 Ticket Client</div>
                      <div style={{ opacity: 0.8, marginTop: 4 }}>
                        <b>Bestellnummer:</b> {order.id}
                        {order.customerName ? (
                          <>
                            {" "}
                            • <b>Name:</b> {order.customerName}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={printTicket}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #111",
                      background: "#111",
                      color: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                    type="button"
                  >
                    🖨️ Drucken
                  </button>
                </div>

                <div style={{ marginTop: 12 }}>
                  {order.items.map((it, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 0",
                        borderBottom: "1px dashed #eee",
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>{it.name}</div>
                      <div style={{ fontWeight: 900 }}>x{it.qty}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 10, opacity: 0.85 }}>
                  Zahlung:{" "}
                  <b>
                    {order.payment === "cash"
                      ? "Cash"
                      : order.payment === "paypal"
                      ? "PayPal"
                      : "Karte/Virement"}
                  </b>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>QR (Commande)</div>
                  <QRCodeCanvas value={makeQrPayload(order)} size={64} />
                </div>
              </div>
            </div>
          )}

          {/* ✅ 4) VIDER PANIER (tout en bas) */}
          <button
            className="af-btn"
            onClick={() => {
              clearCart();
              setCart([]);
              setOrder(null);
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
