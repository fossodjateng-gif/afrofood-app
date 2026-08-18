"use client";

import { useEffect, useState } from "react";
import { getSession } from "@/lib/staff-auth";

const CAISSE_EVENT_ID_KEY = "af_caisse_event_id";

export default function StaffCaissePage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedEventId, setSelectedEventId] = useState("");

  useEffect(() => {
    const s = getSession();
    if (!s) {
      window.location.href = "/team/login";
      return;
    }
    if (s.role !== "cashier" && s.role !== "admin") {
      window.location.href = "/staff";
      return;
    }
    if (s.role === "cashier") {
      window.location.href = "/caisse";
      return;
    }
    setIsAdmin(true);
    void fetch("/api/menu-config", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const nextEvents = Array.isArray(data?.storeConfig?.events)
          ? data.storeConfig.events
              .map((event: { id?: string; name?: string }) => ({
                id: String(event?.id || "").trim(),
                name: String(event?.name || "").trim(),
              }))
              .filter((event: { id: string; name: string }) => event.id && event.name)
          : [];
        setEvents(nextEvents);
        const activeId = String(data?.storeConfig?.activeEventId || "").trim();
        setSelectedEventId(activeId || nextEvents[0]?.id || "");
      })
      .catch(() => {});
  }, []);

  if (!isAdmin) {
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>Redirection caisse...</main>;
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui", background: "#FFF3E6" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "white", border: "1px solid #F1D7C8", borderRadius: 16, padding: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Choix de l'evenement</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>Choisissez l'evenement de cette caisse. La cuisine ouverte depuis cette caisse suivra ce meme evenement.</p>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          style={{ width: "100%", marginTop: 12, padding: "12px 14px", borderRadius: 12, border: "1px solid #ddd" }}
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (!selectedEventId) return;
            localStorage.setItem(CAISSE_EVENT_ID_KEY, selectedEventId);
            window.location.href = "/caisse";
          }}
          style={{ marginTop: 14, width: "100%", padding: "12px 14px", borderRadius: 999, border: "none", background: "linear-gradient(135deg,#ff7a00,#ff3c00)", color: "white", fontWeight: 900, cursor: "pointer" }}
        >
          Ouvrir la caisse
        </button>
      </div>
    </main>
  );
}
