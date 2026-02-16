"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    setCart(getCart());
  }, []);

  const total = cartTotal(cart);

  const dipQtyTotal = cart
    .filter((it) => it.id.startsWith("dip-"))
    .reduce((sum, it) => sum + it.qty, 0);

  const dipExtra = Math.max(0, dipQtyTotal - 1) * 1;


  return (
    <main  className="af-page" style={{ padding: 40, fontFamily: "Arial, sans-serif", maxWidth: 900 }}>
      <a href="/menu" style={{ textDecoration: "none" }}>
        ← Retour au menu
      </a>

      <h1 style={{ marginTop: 12 }}>🛒 Panier</h1>

      {cart.length === 0 ? (
        <p>Ton panier est vide.</p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {cart.map((it) => (
              <div
                key={it.id}
                className="af-card"
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

                <div className="af-price"  style={{ fontSize: 18, fontWeight: 800, whiteSpace: "nowrap" }}>
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
            <div style={{ marginTop: 10, fontSize: 16 }}>
             Zuschlag für Dips: <b>{dipExtra.toFixed(2)} €</b> (ab dem 2. Dip)
            </div>
          )}

          <h2 style={{ marginTop: 24 }}>Total : {total.toFixed(2)} €</h2>


          <button
           className="af-btn"
            onClick={() => {
              clearCart();
              setCart([]);
            }}
            style={{
              marginTop: 12,
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #000",
              background: "white",
              cursor: "pointer",
            }}
          >
            Vider le panier
          </button>
        </>
      )}
    </main>
  );
}
