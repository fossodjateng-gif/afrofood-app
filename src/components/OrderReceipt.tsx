"use client";

import Image from "next/image";
import { QRCodeCanvas } from "qrcode.react";
import { makeQrPayload } from "@/lib/order";
import { getOrderBreakdownEur } from "@/lib/pricing";
import type { OrderRow } from "@/lib/schema";
import type { Lang } from "@/lib/translations";

export type ReceiptLabels = { ticketTitle: string; ticketSub: string; order: string; name: string; payment: string; total: string; ticketLegend: string; ticketSent: string; thanks: string; reprint: string };

function formatReservationDateTime(value: string, lang: Lang) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString(lang === "fr" ? "fr-FR" : lang === "de" ? "de-DE" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function OrderReceipt({ order, lang, labels, onPrint, marginTop = 20, includeReservation = true, qrEvent = true, showEvent = false }: {
  order: OrderRow; lang: Lang; labels: ReceiptLabels; onPrint: () => void; marginTop?: number; includeReservation?: boolean; qrEvent?: boolean; showEvent?: boolean;
}) {
  const breakdown = getOrderBreakdownEur(order.items, order.amount_cents);
  return (<div className="af-ticket-wrap af-ticket-area af-ticket-customer" data-order-id={order.id} style={{ marginTop, justifyItems: "center" }}>
          <div className="af-ticket">
            <div className="af-ticket-head">
              <Image className="af-ticket-logo" src="/logo-afrofood.png" alt="AfroFood" width={72} height={72} unoptimized />
              <div className="af-ticket-title">{labels.ticketTitle}</div>
              <div className="af-ticket-sub">{labels.ticketSub}</div>
            </div>

            <div className="af-ticket-meta">
              <div>
                <b>{labels.order}:</b> {order.id}
              </div>
              <div>
                <b>{labels.name}:</b> {order.customer_name || "-"}
              </div>
	              <div>
	                <b>{labels.payment}:</b> {order.payment}
	              </div>
                {showEvent && order.event_name ? <div><b>Event:</b> {order.event_name}</div> : null}
                {includeReservation && order.reservation_requested ? (
                  <div>
                    <b>{lang === "fr" ? "Reservation" : lang === "de" ? "Reservierung" : "Reservation"}:</b> {lang === "fr" ? "Oui" : lang === "de" ? "Ja" : "Yes"}
                  </div>
                ) : null}
                {includeReservation && order.reservation_time ? (
                  <div>
                    <b>{lang === "fr" ? "Retrait" : lang === "de" ? "Abholung" : "Pickup"}:</b> {formatReservationDateTime(order.reservation_time, lang)}
                  </div>
                ) : null}
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
              {lang === "de" ? "Beleg per QR verfugbar" : "Receipt available via QR"}
            </div>

            <div className="af-ticket-items">
              {order.items.map((it, idx) => (
                <div key={idx} className="af-ticket-row">
                  <div className="af-ticket-name">{it.name}</div>
                  <div className="af-ticket-qty">
                    x{it.qty} - {(breakdown.lineTotals[idx] ?? 0).toFixed(2)} EUR
                  </div>
                  {it.note ? <div style={{ fontSize: 12 }}><b>{lang === "de" ? "Bemerkung" : lang === "fr" ? "Remarque" : "Note"}:</b> {it.note}</div> : null}
                  {it.unitNotes?.map((note, noteIndex) => note?.trim() ? <div key={noteIndex} style={{ fontSize: 12 }}><b>Portion {noteIndex + 1}:</b> {note}</div> : null)}
                </div>
              ))}
            </div>

            <div className="af-ticket-meta">
              <div>
                <b>{labels.total}:</b> {breakdown.total.toFixed(2)} EUR
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{labels.ticketLegend}</div>
            </div>

            <div className="af-ticket-qr">
              <QRCodeCanvas
                value={makeQrPayload({
	                  id: order.id,
	                  createdAt: order.created_at,
	                  customerName: order.customer_name || undefined,
                    eventName: qrEvent ? order.event_name || undefined : undefined,
                    reservationRequested: qrEvent ? order.reservation_requested === true : undefined,
                    reservationTime: qrEvent ? order.reservation_time || undefined : undefined,
	                  payment: order.payment,
	                  items: order.items,
                }) + (order.status === "CANCELED" ? "\nSTATUS:CANCELED" : "")}
                size={72}
              />
              <div className="af-ticket-qrtext">{labels.ticketSent}</div>
            </div>

            <div className="af-ticket-foot">{labels.thanks}</div>
          </div>

          <button
            onClick={onPrint}
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
            {labels.reprint}
          </button>
	        </div>);
}
