"use client";

import React from "react";
import { addToCart, getCart } from "@/lib/cart";

const BRAND = {
  orange: "#F28C28",     // proche du logo
  orangeSoft: "#FFF3E6", // fond chaud très clair
  black: "#111111",
  border: "#F1D7C8",
};


const UI = {
  page: {
    padding: 24,
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    background: BRAND.orangeSoft,

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
    borderRadius: 16,
    border: `1px solid ${BRAND.border}`,
    boxShadow: "0 12px 30px rgba(242,140,40,0.18)",
    background: "white",
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
    fontSize: 20,
    fontWeight: 900,
    letterSpacing: -0.4,
    margin: 0,
    lineHeight: 1.1,
    color: BRAND.black,
  } as React.CSSProperties,

  subtitle: {
    fontSize: 13,
    color: "#555",
    marginTop: 2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 420,
  } as React.CSSProperties,

  pill: {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 16px",
  borderRadius: 999,
  border: "none",
  background: "linear-gradient(135deg, #ff7a00, #ff3c00)",
  color: "white",
  textDecoration: "none",
  fontWeight: 900,
  boxShadow: "0 10px 26px rgba(17,17,17,0.06)", // base
  transition: "all 0.2s ease",                  // important
} as React.CSSProperties,


  note: {
    marginTop: 14,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #eee",
    background: "white",
    color: "#333",
  } as React.CSSProperties,

  section: {
    marginTop: 22,
    padding: "14px 16px",
    borderRadius: 18,
    border: "1px solid #eaeaea",
    background: "white",
    boxShadow: "0 10px 28px rgba(0,0,0,0.05)",
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: 18,
    fontWeight: 900,
    margin: 0,
    paddingBottom: 10,
    borderBottom: "1px solid #eee",
  } as React.CSSProperties,

  grid: {
    display: "grid",
    gap: 12,
    marginTop: 12,
  } as React.CSSProperties,

card: {
  border: `1px solid ${BRAND.border}`,
  borderRadius: 16,
  padding: 14,
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  background: "white",
  boxShadow: "0 10px 26px rgba(17,17,17,0.06)",
  transition: "all 0.2s ease",
} as React.CSSProperties,

  name: {
    fontSize: 16,
    fontWeight: 900,
  } as React.CSSProperties,

  desc: {
    marginTop: 6,
    color: "#555",
    fontSize: 13,
    lineHeight: 1.35,
  } as React.CSSProperties,

  price: {
    fontSize: 18,
    fontWeight: 900,
    whiteSpace: "nowrap",
  } as React.CSSProperties,

btn: {
  marginTop: 10,
  padding: "10px 14px",
  borderRadius: 14,
  border: `1px solid ${BRAND.black}`,
  background: BRAND.black,
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
  transition: "all 0.2s ease",
} as React.CSSProperties,


  checkboxRow: {
    display: "flex",
    gap: 10,
    marginTop: 10,
    alignItems: "center",
    color: "#333",
    fontSize: 13,
  } as React.CSSProperties,
};


type MenuItem = {
  id?: string; // <-- ajouté
  name: string;
  price: number;
  desc?: string;
  tags?: string[];
};

type Section = {
  title: string;
  items: MenuItem[];
};

const sections: Section[] = [
 
 {
  title: "🥣 Dips",
  items: [
    { id: "dip-green", name: "Grüne Sauce (nicht scharf)", price: 0, desc: "1. Dip kostenlos, ab dem 2. Dip +1€" },
    { id: "dip-chili", name: "Chili Sauce (HOT)", price: 0, desc: "1. Dip kostenlos, ab dem 2. Dip +1€" },
  ],
},

 
  {
    title: "🥤 Immunstärkende Getränke",
    items: [
      { name: "Ingwersaft", price: 5, desc: "Ein scharf-würziger Frischekick" },
      { name: "Hibiskussaft", price: 5, desc: "Erfrischend und reich an Antioxidantien" },
    ],
  },
  {
    title: "🍩 Finger Food",
    items: [
      { name: "Puff-puff (1)", price: 5, desc: "Goldbraune Hefebällchen – außen knusprig, innen fluffig", tags: ["VEGAN"], },
      { name: "Plantain Chips", price: 5, desc: "Knusprig frittierte Kochbananenscheiben", tags: ["VEGAN"], },
    ],
  },
  {
    title: "🌍 Afrika besuchen ",
    items: [
      {
        name: "BHB (1)(2) (Kamerun) – Veganer Teller",
        price: 15,
        desc: "Gewürzter Bohneneintopf, serviert mit Maisbrei und frittierte Hefebällchen",
        tags: ["VEGAN"],
      },
      {
        name: "Attiéké Poulet (2) (Elfenbeinküste)",
        price: 15,
        desc: "Lockerer Maniok-Semole mit gegrilltem Pollo Fino, serviert mit frischen Tomaten-Gurken-Zwiebel-Salat",
        tags: ["CHICKEN"],
      },
      {
        name: "Batbout mit Hähnchenfüllung (2) (Marokko)",
        price: 15,
        desc: " Marokkanische Fladenbroten mit gegrilltem Pollo Fino, serviert mit Tomaten und Salat",
        tags: ["CHICKEN"],
      },
    ],
  },
  {
    title: "🔥 Fusion",
    items: [
      {
        name: "Pollo Fino (2)",
        price: 10,
        desc: "Zart gegrilltes Hähnchenfleisch serviert mit frittierte Kochbananenscheiben und Hefebällchen",
        tags: ["CHICKEN"],
      },
      {
        name: "BH (1)(2)",
        price: 10,
        desc: "Gewürzter Bohneneintopf, serviert mit frittierten Hefebällchen und Kochbananenscheiben",
        tags: ["VEGAN"],
      },
      {
        name: "Batbout mit Bohnenfüllung (2)",
        price: 10,
        desc: "Marokkanische Fladenbroten mit gewürzten Bohneneintopf, serviert mit Tomaten und Salat",
        tags: ["VEGAN"],
      },
    ],
  },
];

function Tag({ label }: { label: string }) {
  const bg = label === "VEGAN" ? "#0A7A3D" : BRAND.orange;
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
      {label}
    </span>
  );
}

export default function MenuPage() {
  const [cartCount, setCartCount] = React.useState(0);
React.useEffect(() => {
  const cart = getCart();
  const count = cart.reduce((sum, it) => sum + it.qty, 0);
  setCartCount(count);
}, []);


  return (
    <main style={UI.page} className="af-page">
     <div style={UI.container} className="af-container">

    <div style={UI.topbar} className="af-topbar">

        <a href="/" style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}>
           ← Accueil
        </a>

       <div style={UI.brand} className="af-brand">

              <div style={{ fontSize: 22 }}>🧡</div>
          <div style={{ minWidth: 0 }}>
              <h1 style={UI.title} className="af-title">AfroFood – Menu 2026</h1>
<div style={UI.subtitle} className="af-subtitle">Commande digitale (DE • FR • EN)</div>

          </div>
       </div>

<a
  href="/cart"
  style={UI.pill} className="af-pill"
  onMouseEnter={(e) => {
    e.currentTarget.style.transform = "translateY(-3px)";
    e.currentTarget.style.boxShadow = "0 16px 34px rgba(242,140,40,0.18)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.transform = "translateY(0)";
    e.currentTarget.style.boxShadow = "0 10px 26px rgba(17,17,17,0.06)";
  }}
>
  🛒 Panier <span style={{ opacity: 0.8 }}>({cartCount})</span>
</a>


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


      <p style={{ marginTop: 6 }}>
  <b>Legende:</b> (1) Enthält Gluten • (2) Enthält Sellerie
</p>


      {sections.map((sec) => (
        <section key={sec.title} style={UI.section} className="af-section">
  <h2 style={UI.sectionTitle} className="af-section-title">{sec.title}</h2>

  <div style={UI.grid}>

            {sec.items.map((it) => (
              <div key={it.name} style={UI.card} className="af-card">

                <div>
                  <div style={UI.name}>
                    {it.name}
                    {it.tags?.map((t) => (
                      <Tag key={t} label={t} />
                    ))}
                  </div>

                  {it.desc && <div style={UI.desc} className="af-desc">{it.desc}</div>}

                   
                  <button
  onClick={() => {
    addToCart({
      id: it.id ?? it.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: it.name,
      price: it.price,
      redSauce: false,
      extraRedSauceQty: 0,
    });

    const cart = getCart();
    const count = cart.reduce((sum, it) => sum + it.qty, 0);
    setCartCount(count);
  }}
  style={UI.btn} className="af-btn"
onMouseEnter={(e) => {
  e.currentTarget.style.background = BRAND.orange;
  e.currentTarget.style.borderColor = BRAND.orange;
}}
onMouseLeave={(e) => {
  e.currentTarget.style.background = BRAND.black;
  e.currentTarget.style.borderColor = BRAND.black;
}}

>
  Ajouter
</button>

                </div>

                <div style={UI.price} className="af-price">

                  {it.price.toFixed(2)} €
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      </div>
</main>
  );
}
