"use client";

import { useEffect } from "react";
import { getSession } from "@/lib/staff-auth";

export default function AdministrationPage() {
  useEffect(() => {
    const session = getSession();
    if (!session) { window.location.replace("/team/login"); return; }
    if (session.role !== "admin") { window.location.replace("/staff"); return; }
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("eventId") || params.get("adminEventId");
    window.location.replace(eventId ? `/staff/admin/events?eventId=${encodeURIComponent(eventId)}` : "/admin/menu?view=event&from=admin-events");
  }, []);
  return null;
}
