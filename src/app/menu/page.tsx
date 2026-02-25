"use client";

import React from "react";
import Link from "next/link";
import { addToCart, getCart } from "@/lib/cart";
import { getSavedLang, saveLang, translations, type Lang } from "@/lib/translations";

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
    color: BRAND.black,
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
    color: BRAND.black,
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

  // bouton panier en bas (orange premium)
  bottomCartBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "min(320px, 100%)",
    padding: "12px 16px",
    borderRadius: 999,
    border: "none",
    background: "linear-gradient(135deg, #ff7a00, #ff3c00)",
    color: "white",
    textDecoration: "none",
    fontWeight: 900,
    boxShadow: "0 14px 30px rgba(242,140,40,0.28)",
  } as React.CSSProperties,
};

type LocalizedText = Record<Lang, string>;

type MenuItem = {
  id: string;
  name: LocalizedText;
  price: number;
  desc?: LocalizedText;
  tags?: Array<"VEGAN" | "CHICKEN">;
};

type Section = {
  id: string;
  title: LocalizedText;
  items: MenuItem[];
};

const sections: Section[] = [
  {
    id: "dips",
    title: { de: "Dips", fr: "Dips", en: "Dips" },
    items: [
      {
        id: "dip-green",
        name: {
          de: "Grune Sauce (nicht scharf)",
          fr: "Sauce verte (douce)",
          en: "Green sauce (mild)",
        },
        price: 0,
        desc: {
          de: "1. Dip kostenlos, ab dem 2. Dip +1 EUR",
          fr: "1er dip gratuit, a partir du 2e dip +1 EUR",
          en: "1st dip free, from the 2nd dip +1 EUR",
        },
      },
      {
        id: "dip-chili",
        name: {
          de: "Chili Sauce (scharf)",
          fr: "Sauce chili (piquante)",
          en: "Chili sauce (hot)",
        },
        price: 0,
        desc: {
          de: "1. Dip kostenlos, ab dem 2. Dip +1 EUR",
          fr: "1er dip gratuit, a partir du 2e dip +1 EUR",
          en: "1st dip free, from the 2nd dip +1 EUR",
        },
      },
    ],
  },
  {
    id: "drinks",
    title: { de: "Immungetranke", fr: "Boissons bien-etre", en: "Wellness drinks" },
    items: [
      {
        id: "ingwersaft",
        name: { de: "Ingwersaft", fr: "Jus de gingembre", en: "Ginger juice" },
        price: 5,
        desc: {
          de: "Scharf-wurziger Frischekick",
          fr: "Boisson vive et epicee au gingembre",
          en: "Fresh and spicy ginger boost",
        },
      },
      {
        id: "hibiskussaft",
        name: { de: "Hibiskussaft", fr: "Jus d'hibiscus", en: "Hibiscus juice" },
        price: 5,
        desc: {
          de: "Erfrischend und reich an Antioxidantien",
          fr: "Rafraichissant et riche en antioxydants",
          en: "Refreshing and rich in antioxidants",
        },
      },
    ],
  },
  {
    id: "finger-food",
    title: { de: "Fingerfood", fr: "Finger food", en: "Finger food" },
    items: [
      {
        id: "puff-puff-1",
        name: { de: "Puff-puff (1)", fr: "Puff-puff (1)", en: "Puff-puff (1)" },
        price: 5,
        desc: {
          de: "Goldbraune Hefeballchen, aussen knusprig und innen fluffig",
          fr: "Beignets dores, croustillants dehors et moelleux dedans",
          en: "Golden dough balls, crispy outside and fluffy inside",
        },
        tags: ["VEGAN"],
      },
      {
        id: "plantain-chips",
        name: { de: "Plantain Chips", fr: "Chips de plantain", en: "Plantain chips" },
        price: 5,
        desc: {
          de: "Knusprig frittierte Kochbananenscheiben",
          fr: "Tranches de plantain frites et croustillantes",
          en: "Crispy fried plantain slices",
        },
        tags: ["VEGAN"],
      },
    ],
  },
  {
    id: "africa-tour",
    title: { de: "Afrika entdecken", fr: "Voyage en Afrique", en: "Taste of Africa" },
    items: [
      {
        id: "bhb-1-2-kamerun-veganer-teller",
        name: {
          de: "BHB (1)(2) (Kamerun) - Veganer Teller",
          fr: "BHB (1)(2) (Cameroun) - Assiette vegane",
          en: "BHB (1)(2) (Cameroon) - Vegan plate",
        },
        price: 15,
        desc: {
          de: "Gewurzter Bohneneintopf mit Maisbrei und Puff-puff",
          fr: "Haricot epice avec Bouillie de mais et puff-puff",
          en: "Spiced bean stew with corn mash and puff-puff",
        },
        tags: ["VEGAN"],
      },
      {
        id: "attieke-poulet-2-elfenbeinkuste",
        name: {
          de: "Attieke Poulet (2) (Elfenbeinkuste)",
          fr: "Attieke Poulet (2) (Cote d'Ivoire)",
          en: "Attieke Chicken (2) (Ivory Coast)",
        },
        price: 15,
        desc: {
          de: "Maniok-Semola mit gegrilltem Pollo Fino und Tomaten-Zwiebel-Gurken Salat",
          fr: "Semoule de manioc avec pollo fino grille et Salade de tomates, oignons et concombres",
          en: "Cassava semolina with grilled pollo fino and Tomato, onion and cucumber salad",
        },
        tags: ["CHICKEN"],
      },
      {
        id: "batbout-mit-hahnchenfullung-2-marokko",
        name: {
          de: "Batbout mit Hahnchenfullung (2) (Marokko)",
          fr: "Batbout au poulet (2) (Maroc)",
          en: "Batbout with chicken filling (2) (Morocco)",
        },
        price: 15,
        desc: {
          de: "Marokkanisches Fladenbrot mit gegrilltem Pollo Fino, Tomaten und Salat",
          fr: "Pain marocain garni de pollo fino grille, tomates et salade",
          en: "Moroccan flatbread with grilled pollo fino, tomatoes and salad",
        },
        tags: ["CHICKEN"],
      },
    ],
  },
  {
    id: "fusion",
    title: { de: "Fusion", fr: "Fusion", en: "Fusion" },
    items: [
      {
        id: "pollo-fino-2",
        name: { de: "Pollo Fino (2)", fr: "Pollo Fino (2)", en: "Pollo Fino (2)" },
        price: 10,
        desc: {
          de: "Gegrilltes Hahnchen mit Plantain Chips und Puff-puff",
          fr: "Poulet grille avec chips de plantain et puff-puff",
          en: "Grilled chicken with plantain chips and puff-puff",
        },
        tags: ["CHICKEN"],
      },
      {
        id: "bh-1-2",
        name: { de: "BH (1)(2)", fr: "BH (1)(2)", en: "BH (1)(2)" },
        price: 10,
        desc: {
          de: "Gewurzter Bohneneintopf mit Puff-puff und Plantain Chips",
          fr: "Haricot epice avec puff-puff et chips de plantain",
          en: "Spiced bean stew with puff-puff and plantain chips",
        },
        tags: ["VEGAN"],
      },
      {
        id: "batbout-mit-bohnenfullung-2",
        name: {
          de: "Batbout mit Bohnenfullung (2)",
          fr: "Batbout aux haricots (2)",
          en: "Batbout with bean filling (2)",
        },
        price: 10,
        desc: {
          de: "Marokkanisches Fladenbrot mit gewurzten Bohnen, Tomaten und Salat",
          fr: "Pain marocain garni de haricot epice, tomates et salade",
          en: "Moroccan flatbread with spiced bean stew, tomatoes and salad",
        },
        tags: ["VEGAN"],
      },
    ],
  },
];

function Tag({ label, lang }: { label: "VEGAN" | "CHICKEN"; lang: Lang }) {
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

  React.useEffect(() => {
    setLang(getSavedLang());
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
            <div style={{ minWidth: 0 }}>
              <h1 style={UI.title} className="af-title">
                AfroFood - Menu 2026
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
        <p style={{ marginTop: 10 }}>
          <b>{t.legend}:</b> {t.legend_details}
        </p>

        {/* sections */}
        {sections.map((sec) => (
          <section key={sec.id} style={UI.section} className="af-section">
            <h2 style={UI.sectionTitle} className="af-section-title">
              {sec.title[lang]}
            </h2>

            <div style={UI.grid}>
              {sec.items.map((it) => (
                <div key={it.id} style={UI.card} className="af-card">
                  <div>
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


