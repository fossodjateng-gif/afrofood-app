"use client";

import React from "react";
import Link from "next/link";
import { addToCart, getCart } from "@/lib/cart";
import { getSavedLang, saveLang, translations, type Lang } from "@/lib/translations";
import {
  getMenuItemImagePath,
  MENU_CATALOG,
  type CatalogSection,
  type MenuTag,
} from "@/lib/menu-catalog";

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
    backgroundColor: BRAND.orangeSoft,
    backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    backgroundSize: "cover, min(64vw, 420px)",
    minHeight: "100vh",
  } as React.CSSProperties,

  container: {
    maxWidth: 960,
    margin: "0 auto",
  } as React.CSSProperties,

  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 20,
    border: `1px solid rgba(17,17,17,0.08)`,
    boxShadow: "0 18px 38px rgba(0,0,0,0.36)",
    background: "white",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    position: "sticky",
    top: 12,
    zIndex: 20,
  } as React.CSSProperties,

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  } as React.CSSProperties,

  title: {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: -0.5,
    margin: 0,
    lineHeight: 1.1,
    color: BRAND.black,
  } as React.CSSProperties,

  subtitle: {
    fontSize: 13,
    color: "#5f5f5f",
    marginTop: 2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 420,
  } as React.CSSProperties,

  section: {
    marginTop: 22,
    padding: "16px 18px",
    borderRadius: 22,
    border: "1px solid #F1D7C8",
    background: "rgba(255,255,255,0.9)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 18px 38px rgba(0,0,0,0.28)",
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: 22,
    fontWeight: 900,
    margin: 0,
    paddingBottom: 12,
    borderBottom: "1px solid rgba(17,17,17,0.06)",
    letterSpacing: -0.3,
  } as React.CSSProperties,

  grid: {
    display: "grid",
    gap: 12,
    marginTop: 12,
  } as React.CSSProperties,

  card: {
    border: `1px solid rgba(17,17,17,0.06)`,
    borderRadius: 20,
    padding: 16,
    display: "flex",
    gap: 16,
    background: "rgba(255,250,246,0.92)",
    boxShadow: "0 14px 30px rgba(0,0,0,0.24)",
    transition: "all 0.2s ease",
    flexWrap: "wrap",
  } as React.CSSProperties,

  imageFrame: {
    flex: "0 0 180px",
    width: 180,
    minHeight: 180,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
    background:
      "linear-gradient(135deg, rgba(242,140,40,0.18), rgba(17,17,17,0.08))",
    border: `1px solid ${BRAND.border}`,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
  } as React.CSSProperties,

  image: {
    width: "100%",
    height: "100%",
    minHeight: 180,
    objectFit: "cover",
    display: "block",
  } as React.CSSProperties,

  cardContent: {
    flex: "1 1 280px",
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
    alignItems: "flex-start",
  } as React.CSSProperties,

  cardText: {
    flex: "1 1 auto",
  } as React.CSSProperties,

  name: {
    fontSize: 18,
    fontWeight: 900,
    color: BRAND.black,
    letterSpacing: -0.2,
  } as React.CSSProperties,

  desc: {
    marginTop: 8,
    color: "#5f5f5f",
    fontSize: 14,
    lineHeight: 1.45,
  } as React.CSSProperties,

  price: {
    fontSize: 20,
    fontWeight: 900,
    whiteSpace: "nowrap",
    color: BRAND.black,
    letterSpacing: -0.3,
  } as React.CSSProperties,

  btn: {
    marginTop: 12,
    padding: "11px 16px",
    borderRadius: 999,
    border: "1px solid #111",
    background: "#111",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
    letterSpacing: -0.2,
    boxShadow: "0 12px 24px rgba(15,23,42,0.16)",
    transition: "all 0.2s ease",
  } as React.CSSProperties,

  // bouton panier en bas (orange premium)
  bottomCartBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "min(320px, 100%)",
    padding: "13px 18px",
    borderRadius: 999,
    border: "none",
    background: "linear-gradient(180deg, #ff8a1f, #ff6500)",
    color: "white",
    textDecoration: "none",
    fontWeight: 900,
    letterSpacing: -0.2,
    boxShadow: "0 16px 34px rgba(242,140,40,0.30)",
  } as React.CSSProperties,
};

type RuntimeItem = CatalogSection["items"][number] & { price: number; visible: boolean };
type RuntimeSection = Omit<CatalogSection, "items"> & { items: RuntimeItem[] };
const MENU_IMAGE_FALLBACK = "/logo-afrofood.png";

function Tag({ label, lang }: { label: MenuTag; lang: Lang }) {
  const bg = label === "VEGAN" ? "#0A7A3D" : BRAND.orange;
  const text =
    label === "VEGAN"
      ? { de: "VEGAN", fr: "VEGAN", en: "VEGAN" }[lang]
      : { de: "HUHN", fr: "POULET", en: "CHICKEN" }[lang];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        color: "white",
        background: bg,
        fontSize: 11,
        marginLeft: 8,
        fontWeight: 900,
        letterSpacing: 0.3,
      }}
    >
      {text}
    </span>
  );
}

export default function MenuPage() {
  const [cartCount, setCartCount] = React.useState(0);
  const [lang, setLang] = React.useState<Lang>("de");
  const [sections, setSections] = React.useState<RuntimeSection[]>(() =>
    MENU_CATALOG.map((section) => ({
      ...section,
      items: section.items.map((it) => ({
        ...it,
        imagePath: it.imagePath ?? getMenuItemImagePath(it.id),
        price: it.basePrice,
        visible: true,
      })),
    }))
  );

  React.useEffect(() => {
    setLang(getSavedLang());
  }, []);

  React.useEffect(() => {
    let alive = true;
    async function loadMenuConfig() {
      const res = await fetch("/api/menu-config", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!alive) return;
      if (res.ok && data?.ok && Array.isArray(data.sections)) {
        setSections(data.sections as RuntimeSection[]);
      }
    }
    loadMenuConfig();
    return () => {
      alive = false;
    };
  }, []);

  function setLanguage(next: Lang) {
    setLang(next);
    saveLang(next);
  }

  const t = translations[lang];

  React.useEffect(() => {
    const cart = getCart();
    const count = cart.reduce((sum, it) => sum + it.qty, 0);
    setCartCount(count);
  }, []);

  return (
    <main style={UI.page} className="af-page">
      <div style={UI.container} className="af-container">
        {/* TOPBAR */}
        <div style={UI.topbar} className="af-topbar">
          {/* gauche */}
          <Link
            href="/"
            className="af-back"
            style={{ textDecoration: "none", fontWeight: 900, color: BRAND.black }}
          >
            {t.home ?? "Accueil"}
          </Link>

          {/* centre */}
          <div style={UI.brand} className="af-brand">
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
            <div style={{ minWidth: 0 }}>
              <h1 style={UI.title} className="af-title">
                Menu
              </h1>
              <div style={UI.subtitle} className="af-subtitle">
                {t.subtitle ?? "Commande digitale (DE / FR / EN)"}
              </div>
            </div>
          </div>

          {/* droite : langues */}
          <div className="af-actions">
            <div className="af-lang">
              {(["de", "fr", "en"] as Lang[]).map((L) => (
                <button
                  key={L}
                  type="button"
                  onClick={() => setLanguage(L)}
                  className={`af-lang-btn ${lang === L ? "is-active" : ""}`}
                >
                  {L.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* motif / ligne (EN DEHORS du topbar) */}
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

        {/* legende */}
        <p style={{ marginTop: 12, color: "#5f5f5f", fontSize: 14, lineHeight: 1.45 }}>
          <b>{t.legend}:</b> {t.legend_details}
        </p>

        {/* sections */}
        {sections.map((sec) => (
          <section key={sec.id} style={UI.section} className="af-section">
            <h2 style={UI.sectionTitle} >
              {sec.title[lang]}
            </h2>

            <div style={UI.grid}>
              {sec.items.map((it) => (
                <div key={it.id} style={UI.card} className="af-card">
                  <div style={UI.imageFrame}>
                    <img
                      src={it.imagePath || MENU_IMAGE_FALLBACK}
                      alt={it.name[lang]}
                      style={UI.image}
                      loading="lazy"
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (!img.dataset.fallbackApplied) {
                          img.dataset.fallbackApplied = "true";
                          img.src = MENU_IMAGE_FALLBACK;
                        }
                      }}
                    />
                  </div>

                  <div style={UI.cardContent}>
                    <div style={UI.cardText}>
                      <div style={UI.name}>
                        {it.name[lang]}
                        {it.tags?.map((tg) => (
                          <Tag key={tg} label={tg} lang={lang} />
                        ))}
                      </div>

                      {it.desc && (
                        <div style={UI.desc} className="af-desc">
                          {it.desc[lang]}
                        </div>
                      )}

                      <button
                        className="af-btn"
                        style={UI.btn}
                        onClick={() => {
                          addToCart({
                            id: it.id,
                            name: it.name[lang],
                            price: it.price,
                            redSauce: false,
                            extraRedSauceQty: 0,
                          });

                          const cart = getCart();
                          const count = cart.reduce((sum, x) => sum + x.qty, 0);
                          setCartCount(count);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = BRAND.orange;
                          e.currentTarget.style.borderColor = BRAND.orange;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = BRAND.black;
                          e.currentTarget.style.borderColor = BRAND.black;
                        }}
                      >
                        {t.add ?? "Hinzufugen"}
                      </button>
                    </div>

                    <div style={UI.price} className="af-price">
                      {it.price.toFixed(2)} EUR
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* BARRE PANIER EN BAS (seule) */}
      <div className="af-mobile-cartbar">
        <Link href="/cart" className="af-mobile-cartbtn" style={UI.bottomCartBtn}>
          {t.cart ?? "Warenkorb"} ({cartCount})
        </Link>
      </div>
    </main>
  );
}


