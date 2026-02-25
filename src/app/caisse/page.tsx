"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrderRow } from "@/lib/schema";
import { QRCodeCanvas } from "qrcode.react";
import { makeQrPayload } from "@/lib/order";
import { subscribeOrderSync } from "@/lib/order-sync";

const PIN_CODE = "1955";

type CaisseCard = OrderRow & { isJustValidated?: boolean };

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
    return paidQty * 1;
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

export default function CaissePage() {
  const [pin, setPin] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const [orders, setOrders] = useState<CaisseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ticketOrder, setTicketOrder] = useState<OrderRow | null>(null);

  function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Erreur inconnue";
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
      setActionError(getErrorMessage(e));
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
      setActionError(null);
      setValidatingId(order.id);

      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "NEW" }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Erreur pendant la validation du paiement");
      }

      setTicketOrder(order);
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
      setActionError(getErrorMessage(e));
    } finally {
      setValidatingId(null);
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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Caisse securisee</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>Entrer le code a 4 chiffres</p>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="Code PIN"
            style={{ marginTop: 10, width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #475569", background: "#0f172a", color: "white" }}
          />
          {pinError ? <div style={{ marginTop: 8, color: "#fca5a5", fontWeight: 700 }}>{pinError}</div> : null}
          <button
            type="button"
            onClick={() => {
              if (pin === PIN_CODE) {
                setPinError(null);
                setIsUnlocked(true);
              } else {
                setPinError("Code incorrect");
              }
            }}
            style={{ marginTop: 10, width: "100%", padding: "10px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#ff7a00,#ff3c00)", color: "white", fontWeight: 900, cursor: "pointer" }}
          >
            Valider
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
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Caisse - Validation Paiement</h1>
      <p style={{ opacity: 0.75 }}>Validation manuelle puis envoi cuisine</p>

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
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
          {isRefreshing ? "Actualisation..." : justRefreshed ? "Actualise" : "Actualiser"}
        </button>
      </div>

      {loading ? <p style={{ marginTop: 12 }}>Chargement...</p> : null}
      {actionError ? <p style={{ marginTop: 8, color: "#fecaca", fontWeight: 700 }}>Erreur: {actionError}</p> : null}
      {sortedOrders.length === 0 ? <p style={{ opacity: 0.8, marginTop: 12 }}>Aucune commande.</p> : null}

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {sortedOrders.map((o) => {
          const isPending = o.status === "PENDING_PAYMENT";
          const breakdown = getOrderBreakdown(o);

          return (
            <div
              key={o.id}
              style={{
                background: isPending ? "rgba(249,115,22,0.22)" : "rgba(22,163,74,0.22)",
                borderRadius: 16,
                padding: 16,
                border: isPending ? "1px solid #fb923c" : "1px solid #22c55e",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{o.id}</div>
                  <div style={{ opacity: 0.9, marginTop: 2 }}>
                    {o.customer_name ? `Nom: ${o.customer_name} - ` : ""}
                    Paiement: {o.payment}
                  </div>
                </div>

                {isPending ? (
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
                    {validatingId === o.id ? "Validation..." : "Valider paiement"}
                  </button>
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
                    Validee
                  </div>
                )}
              </div>

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
                  <span>Total</span>
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
              <div className="af-ticket-title">Ticket Client</div>
              <div className="af-ticket-sub">Emis apres validation paiement</div>
            </div>

            <div className="af-ticket-meta">
              <div>
                <b>Commande:</b> {ticketOrder.id}
              </div>
              <div>
                <b>Nom:</b> {ticketOrder.customer_name || "-"}
              </div>
              <div>
                <b>Paiement:</b> {ticketOrder.payment}
              </div>
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
                <b>Total:</b> {ticketBreakdown.total.toFixed(2)} EUR
              </div>
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
              <div className="af-ticket-qrtext">Commande envoyee en cuisine</div>
            </div>

            <div className="af-ticket-foot">Merci et bon appetit</div>
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
            Reimprimer ticket
          </button>
        </div>
      ) : null}
    </main>
  );
}
