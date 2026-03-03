"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lang } from "@/lib/translations";
import { getSavedLang, saveLang } from "@/lib/translations";

type AdminItem = {
  id: string;
  name: Record<Lang, string>;
  price: number;
  visible: boolean;
};

type AdminSection = {
  id: string;
  title: Record<Lang, string>;
  items: AdminItem[];
};

export default function AdminMenuPage() {
  const [lang, setLang] = useState<Lang>("fr");
  const [pin, setPin] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sections, setSections] = useState<AdminSection[]>([]);

  useEffect(() => {
    setLang(getSavedLang());
  }, []);

  const allItems = useMemo(
    () => sections.flatMap((section) => section.items.map((item) => ({ ...item, sectionId: section.id }))),
    [sections]
  );

  async function loadData(p: string) {
    setLoading(true);
    setAuthError(null);
    const res = await fetch("/api/admin/menu-config", {
      headers: { "x-admin-pin": p },
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Unauthorized");
    }
    setSections(Array.isArray(data.sections) ? (data.sections as AdminSection[]) : []);
  }

  async function saveItem(item: AdminItem) {
    try {
      setSavingId(item.id);
      const res = await fetch("/api/admin/menu-config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-pin": pin,
        },
        body: JSON.stringify({
          itemId: item.id,
          price: item.price,
          visible: item.visible,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Save failed");
      }
    } finally {
      setSavingId(null);
    }
  }

  if (!isUnlocked) {
    return (
      <main style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui", background: "#FFF3E6", color: "#111" }}>
        <div style={{ maxWidth: 420, margin: "0 auto", background: "white", border: "1px solid #F1D7C8", borderRadius: 14, padding: 16 }}>
          <h1 style={{ marginTop: 0 }}>Admin Menu</h1>
          <p style={{ opacity: 0.8 }}>Entrer le PIN admin</p>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
            type="password"
            autoComplete="off"
            inputMode="numeric"
            placeholder="PIN"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }}
          />
          {authError ? <div style={{ color: "#b91c1c", fontWeight: 700, marginTop: 8 }}>{authError}</div> : null}
          <button
            type="button"
            onClick={async () => {
              try {
                await loadData(pin);
                saveLang(lang);
                setIsUnlocked(true);
              } catch (e: unknown) {
                setAuthError(e instanceof Error ? e.message : "Unauthorized");
              }
            }}
            style={{ marginTop: 10, width: "100%", padding: "10px 12px", borderRadius: 10, border: "none", background: "#111", color: "white", fontWeight: 900 }}
          >
            Ouvrir admin
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui", background: "#FFF3E6", color: "#111" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <h1 style={{ margin: 0 }}>Admin Menu</h1>
          <a href="/staff" style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}>Retour staff</a>
        </div>
        <p style={{ opacity: 0.8 }}>Modifier prix et visibilite sans redeploiement.</p>
        {loading ? <p>Chargement...</p> : null}

        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {allItems.map((item) => (
            <div key={item.id} style={{ background: "white", border: "1px solid #F1D7C8", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 900 }}>{item.name[lang]}</div>
              <div style={{ opacity: 0.7, fontSize: 12, marginTop: 2 }}>{item.id}</div>
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={Number.isFinite(item.price) ? item.price : 0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setSections((prev) =>
                      prev.map((section) => ({
                        ...section,
                        items: section.items.map((it) => (it.id === item.id ? { ...it, price: Number.isFinite(v) ? v : 0 } : it)),
                      }))
                    );
                  }}
                  style={{ width: 120, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd" }}
                />
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={item.visible}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSections((prev) =>
                        prev.map((section) => ({
                          ...section,
                          items: section.items.map((it) => (it.id === item.id ? { ...it, visible: checked } : it)),
                        }))
                      );
                    }}
                  />
                  Visible
                </label>
                <button
                  type="button"
                  onClick={() => saveItem(item)}
                  disabled={savingId === item.id}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#111", color: "white", fontWeight: 800 }}
                >
                  {savingId === item.id ? "Sauvegarde..." : "Sauvegarder"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

