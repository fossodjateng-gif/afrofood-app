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

  return (
    <main style={{ padding: 40, fontFamily: "Arial, sans-serif", maxWidth: 900 }}>
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

  <div style={{ minWidth: 90 }}>−  Quantité  +  🗑️</div>

  <button
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

                <div style={{ fontSize: 18, fontWeight: 800, whiteSpace: "nowrap" }}>
                  {(it.price * it.qty).toFixed(2)} €
                </div>
              </div>
            ))}
          </div>

          <h2 style={{ marginTop: 24 }}>Total : {total.toFixed(2)} €</h2>

          <button
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
