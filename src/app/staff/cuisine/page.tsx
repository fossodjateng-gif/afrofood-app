"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSession, clearSession, getStaffRoleLabel } from "@/lib/staff-auth";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { goBackOr } from "@/lib/client-nav";

const UI_TEXT: Record<
  Lang,
  {
    title: string;
    loggedAs: string;
    home: string;
    back: string;
    logout: string;
    section: string;
    kitchen: string;
    readyOrders: string;
    addProduct: string;
    pricing: string;
  }
> = {
  fr: {
    title: "Espace Cuisine",
    loggedAs: "Connecte en tant que",
    home: "Accueil",
    back: "Retour",
    logout: "Se deconnecter",
    section: "Cuisine",
    kitchen: "Cuisine",
    readyOrders: "Commande prete",
    addProduct: "Ajouter produit",
    pricing: "Changer prix / visibilite",
  },
  de: {
    title: "Kuchenbereich",
    loggedAs: "Angemeldet als",
    home: "Start",
    back: "Zuruck",
    logout: "Abmelden",
    section: "Kuche",
    kitchen: "Kuche",
    readyOrders: "Fertige Bestellungen",
    addProduct: "Produkt hinzufugen",
    pricing: "Preis / Sichtbarkeit andern",
  },
  en: {
    title: "Kitchen Space",
    loggedAs: "Logged in as",
    home: "Home",
    back: "Back",
    logout: "Logout",
    section: "Kitchen",
    kitchen: "Kitchen",
    readyOrders: "Ready Orders",
    addProduct: "Add product",
    pricing: "Change price / visibility",
  },
};

function StaffCuisinePageContent() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [lang, setLang] = useState<Lang>("fr");
  const [role, setRole] = useState<"admin" | "cashier" | "kitchen" | null>(null);
  const fromCaisse = String(searchParams.get("from") || "").toLowerCase() === "caisse";

  useEffect(() => {
    setLang(getSavedLang());
    const s = getSession();
    if (!s) {
      window.location.href = "/team/login";
      return;
    }
    if (s.role !== "kitchen" && s.role !== "admin" && s.role !== "cashier") {
      window.location.href = "/staff";
      return;
    }
    setUsername(s.username);
    setRole(s.role);
  }, []);
  const t = UI_TEXT[lang];

  const canShowCatalogCards = fromCaisse || role === "admin" || role === "kitchen" || role === "cashier";

  const cards = [
    { href: fromCaisse ? "/kitchen?from=caisse" : "/kitchen", label: t.kitchen },
    { href: fromCaisse ? "/screen?from=caisse" : "/screen", label: t.readyOrders },
    ...(canShowCatalogCards
      ? [
          { href: fromCaisse ? "/admin/menu?view=add&from=caisse" : "/admin/menu?view=add", label: t.addProduct },
          { href: fromCaisse ? "/admin/menu?view=pricing&from=caisse" : "/admin/menu?view=pricing", label: t.pricing },
        ]
      : []),
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui",
        backgroundColor: "#FFF3E6",
        backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center, center",
        backgroundSize: "cover, min(64vw, 420px)",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
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
              <span>{t.loggedAs}: {username || "-"}</span>
              {role ? <span className="af-role-badge">Role: {getStaffRoleLabel(role, lang)}</span> : null}
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
            <button type="button" onClick={() => goBackOr(fromCaisse ? "/caisse" : "/staff")} className="af-link-btn" style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800, cursor: "pointer" }}>{t.back}</button>
            <a href="/" className="af-link-btn" style={{ textDecoration: "none", padding: "8px 12px", borderRadius: 10, border: "1px solid #111", color: "#111", fontWeight: 800 }}>{t.home}</a>
            {!fromCaisse ? (
              <button
                className="af-btn"
                type="button"
                onClick={() => {
                  clearSession();
                  window.location.href = "/team/login";
                }}
                style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: "rgba(12,10,8,0.98)", color: "white", fontWeight: 800, cursor: "pointer" }}
              >
                {t.logout}
              </button>
            ) : null}
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

        <div style={{ marginTop: 12, background: "white", border: "1px solid #F1D7C8", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>{t.section}</div>
          <div style={{ marginTop: 10, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
            {cards.map((c) => (
              <a
                key={c.href + c.label}
                href={c.href}
                className="af-link-btn"
                style={{
                  textDecoration: "none",
                  color: "#111",
                  background: "#fffaf6",
                  border: "1px solid #F1D7C8",
                  borderRadius: 12,
                  padding: 14,
                  fontWeight: 900,
                }}
              >
                {c.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function StaffCuisinePage() {
  return (
    <Suspense fallback={null}>
      <StaffCuisinePageContent />
    </Suspense>
  );
}
