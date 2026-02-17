"use client";

import { useEffect, useState } from "react";
import { translations, type Lang, getSavedLang, saveLang } from "@/lib/translations";

import {
  getCart,
  cartTotal,
  clearCart,
  incrementItem,
  decrementItem,
  removeItem,
  type CartItem,
} from "@/lib/cart";


export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
const [lang, setLang] = useState<Lang>("de");

useEffect(() => {
  setLang(getSavedLang());
}, []);

const t = translations[lang];



  useEffect(() => {
    setCart(getCart());
  }, []);

  const total = cartTotal(cart);

  const dipQtyTotal = cart
    .filter((it) => it.id.startsWith("dip-"))
    .reduce((sum, it) => sum + it.qty, 0);

  const dipExtra = Math.max(0, dipQtyTotal - 1) * 1;


  return (
    <main
  className="af-page"
  style={{
    padding: 40,
    fontFamily: "Arial, sans-serif",
    maxWidth: 1000,
    margin: "0 auto",
    background: "linear-gradient(180deg, #fff5ec 0%, #ffe9dc 100%)",
    minHeight: "100vh",
  }}
>

      <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 12,
  }}
>
  <a href="/menu" style={{ textDecoration: "none", fontWeight: 800 }}>
    {t.cart_back}
  </a>

  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <button
      onClick={() => {
        setLang("de");
        saveLang("de");
      }}
      style={{
        padding: "6px 10px",
        borderRadius: 10,
        border: "1px solid #111",
        background: lang === "de" ? "#111" : "white",
        color: lang === "de" ? "white" : "#111",
        cursor: "pointer",
        fontWeight: 800,
      }}
    >
      DE
    </button>

    <button
      onClick={() => {
        setLang("fr");
        saveLang("fr");
      }}
      style={{
        padding: "6px 10px",
        borderRadius: 10,
        border: "1px solid #111",
        background: lang === "fr" ? "#111" : "white",
        color: lang === "fr" ? "white" : "#111",
        cursor: "pointer",
        fontWeight: 800,
      }}
    >
      FR
    </button>

    <button
      onClick={() => {
        setLang("en");
        saveLang("en");
      }}
      style={{
        padding: "6px 10px",
        borderRadius: 10,
        border: "1px solid #111",
        background: lang === "en" ? "#111" : "white",
        color: lang === "en" ? "white" : "#111",
        cursor: "pointer",
        fontWeight: 800,
      }}
    >
      EN
    </button>
  </div>

  <h1 style={{ margin: 0, width: "100%" }}>{t.cart_title}</h1>
</div>


      {cart.length === 0 ? (
        <p>{t.cart_title}</p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {cart.map((it) => (
              <div
                key={it.id}
                className="af-card"
                style={{
  border: "1px solid #ffd2b8",
  borderRadius: 18,
  padding: 18,
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  background: "white",
  boxShadow: "0 12px 30px rgba(255, 120, 0, 0.08)",
  transition: "all 0.2s ease",
}}

              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{it.name}</div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
  <button
   className="af-btn"
    onClick={() => {
      decrementItem(it.id);
      setCart(getCart());
    }}
    style={{
      padding: "4px 10px",
      borderRadius: 8,
      border: "1px solid #000",
      background: "white",
      cursor: "pointer",
    }}
  >
    −
  </button>

<div
  style={{
    minWidth: 90,
    textAlign: "center",
    fontWeight: 800,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: "#f7f7f7",
  }}
>
  x{it.qty}
</div>


  <button
   className="af-btn"
    onClick={() => {
      incrementItem(it.id);
      setCart(getCart());
    }}
    style={{
      padding: "4px 10px",
      borderRadius: 8,
      border: "1px solid #000",
      background: "white",
      cursor: "pointer",
    }}
  >
    +
  </button>

  <button
   className="af-btn"
   onClick={() => { 
      removeItem(it.id);
      setCart(getCart());
    }}
    style={{
      marginLeft: 10,
      padding: "4px 10px",
      borderRadius: 8,
      border: "1px solid #000",
      background: "white",
      cursor: "pointer",
    }}
  >
    🗑️
  </button>
</div>

                </div>

                <div
  className="af-price"
  style={{
    fontSize: 20,
    fontWeight: 900,
    color: "#ff4d00",
    whiteSpace: "nowrap",
  }}
>

  {it.id.startsWith("dip-")
    ? (
        // Prix dynamique des dips
        Math.max(0, it.qty - 1) * 1
      ).toFixed(2)
    : (it.price * it.qty).toFixed(2)
  } €
</div>

              </div>
            ))}
          </div>

          {dipExtra > 0 && (
            <div
  style={{
    marginTop: 14,
    padding: "12px 16px",
    borderRadius: 14,
    background: "#fff3e8",
    border: "1px solid #ffd2b8",
    fontWeight: 600,
  }}
>
  {t.cart_dips_extra}: <b>{dipExtra.toFixed(2)} €</b> {t.cart_dips_note}
</div>

          )}

          <h2
  style={{
    marginTop: 28,
    fontSize: 28,
    fontWeight: 900,
    color: "#111",
  }}
>
  {t.cart_total}: 
  <span style={{ color: "#ff4d00" }}>
    {" "} {total.toFixed(2)} €
  </span>
</h2>



          <button
           className="af-btn"
            onClick={() => {
              clearCart();
              setCart([]);
            }}
        style={{
  marginTop: 16,
  padding: "12px 20px",
  borderRadius: 999,
  border: "none",
  background: "linear-gradient(135deg, #ff7a00, #ff3c00)",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 8px 20px rgba(255,80,0,0.35)",
}}

          >
           {t.cart_clear}
          </button>
        </>
      )}
    </main>
  );
}
