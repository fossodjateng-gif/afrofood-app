"use client";

import React from "react";
import { addToCart } from "@/lib/cart";

type MenuItem = {
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
    title: "🥤 Immunstärkende Getränke / Boissons / Drinks",
    items: [
      { name: "Ingwersaft", price: 5, desc: "Ein scharf-würziger Frischekick" },
      { name: "Hibiskussaft", price: 5, desc: "Erfrischend und reich an Antioxidantien" },
    ],
  },
  {
    title: "🍩 Finger Food",
    items: [
      { name: "Puff-puff", price: 5, desc: "Frittierte Hefebällchen – außen knusprig, innen weich" },
      { name: "Plantain Chips", price: 5, desc: "Knusprig frittierte Kochbananenscheiben" },
    ],
  },
  {
    title: "🌍 Afrika besuchen (3 Menüs principaux)",
    items: [
      {
        name: "BHB (Kamerun) – Veganer Teller",
        price: 15,
        desc: "Gewürzter Bohneneintopf mit Puff-puff und Maisbrei",
        tags: ["VEGAN"],
      },
      {
        name: "Attiéké Poulet (Côte d’Ivoire)",
        price: 15,
        desc: "Attiéké + poulet braisé + crudités, Sauce verte incluse, sauce rouge sur demande",
        tags: ["CHICKEN"],
      },
      {
        name: "Mini Batbout farci au poulet (Maroc)",
        price: 15,
        desc: "Batbout + poulet + crudités, Sauce verte incluse, sauce rouge sur demande",
        tags: ["CHICKEN"],
      },
    ],
  },
  {
    title: "🔥 Fusion",
    items: [
      {
        name: "Pollo Fino",
        price: 10,
        desc: "Poulet braisé + puff-puff + plantains (Sauce verte incluse, sauce rouge sur demande)",
        tags: ["CHICKEN"],
      },
      {
        name: "BH – Veganer Teller",
        price: 10,
        desc: "Haricots rouges + puff-puff + plantains (Sauce verte incluse, sauce rouge sur demande)",
        tags: ["VEGAN"],
      },
      {
        name: "Batbout Vegan",
        price: 10,
        desc: "Batbout + haricots + crudités (Sauce verte incluse, sauce rouge sur demande)",
        tags: ["VEGAN"],
      },
    ],
  },
];

function Tag({ label }: { label: string }) {
  const bg = label === "VEGAN" ? "#0a7" : "#a50";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        color: "white",
        background: bg,
        fontSize: 12,
        marginLeft: 8,
      }}
    >
      {label}
    </span>
  );
}

export default function MenuPage() {
  const [cartCount, setCartCount] = React.useState(0);

  const [redSauceChoice, setRedSauceChoice] = React.useState<Record<string, boolean>>({});

  

  return (
    <main style={{ padding: 40, fontFamily: "Arial, sans-serif", maxWidth: 900 }}>
      <a href="/" style={{ textDecoration: "none" }}>
        ← Accueil
      </a>

      <h1 style={{ marginTop: 12 }}>📋 AfroFood – Menu 2026</h1>

      <div style={{ marginTop: 10 }}>
        <a
          href="/cart"
          style={{
            display: "inline-block",
            padding: "8px 12px",
            border: "1px solid #000",
            borderRadius: 10,
            textDecoration: "none",
          }}
        >
          🛒 Voir le panier ({cartCount})
        </a>
      </div>

      <p style={{ marginTop: 6 }}>
        ✅ Sauce verte <b>incluse</b> • 🌶️ Sauce rouge <b>sur demande</b> (1ère portion gratuite, extras +1€ plus tard)
      </p>

      {sections.map((sec) => (
        <section key={sec.title} style={{ marginTop: 28 }}>
          <h2 style={{ borderBottom: "1px solid #ddd", paddingBottom: 6 }}>{sec.title}</h2>

          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {sec.items.map((it) => (
              <div
                key={it.name}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    {it.name}
                    {it.tags?.map((t) => (
                      <Tag key={t} label={t} />
                    ))}
                  </div>

                  {it.desc && <div style={{ marginTop: 6, color: "#444" }}>{it.desc}</div>}
                  {it.tags && (
                    <label style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
  <input
    type="checkbox"
    checked={!!redSauceChoice[it.name]}
    onChange={(e) =>
      setRedSauceChoice((prev) => ({
        ...prev,
        [it.name]: e.target.checked,
      }))
    }
  />
  🌶️ Sauce rouge (1ère portion gratuite, extras +1€)
</label>
)}

 

{/* Sauce rouge seulement pour les plats */}
{it.tags && (
  <label style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
    <input
      type="checkbox"
      checked={!!redSauceChoice[it.name]}
      onChange={(e) =>
        setRedSauceChoice((prev) => ({
          ...prev,
          [it.name]: e.target.checked,
        }))
      }
    />
    🌶️ Sauce rouge (1ère portion gratuite, extras +1€)
  </label>
)}

                  <button
                    onClick={() => {
                      addToCart({
                        id: it.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                        name: it.name,
                        price: it.price,
                        redSauce: !!redSauceChoice[it.name],
                        extraRedSauceQty: 0,
                      });
                      setCartCount((n) => n + 1);
                    }}
                    style={{
                      marginTop: 10,
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #000",
                      background: "white",
                      cursor: "pointer",
                    }}
                  >
                    Ajouter
                  </button>
                </div>

                <div style={{ fontSize: 18, fontWeight: 800, whiteSpace: "nowrap" }}>
                  {it.price.toFixed(2)} €
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
