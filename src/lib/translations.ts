export type Lang = "de" | "fr" | "en";

export const LANG_KEY = "af_lang";

export function getSavedLang(): Lang {
  if (typeof window === "undefined") return "de";
  const v = localStorage.getItem(LANG_KEY);
  if (v === "fr" || v === "en" || v === "de") return v;
  return "de";
}

export function saveLang(lang: Lang) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LANG_KEY, lang);
}


export const translations = {
  de: {
    home: "Startseite",   // 👈 AJOUTE CETTE LIGNE
    menu: "Menü",
    cart: "Warenkorb",
    add: "Hinzufügen",
    emptyCart: "Dein Warenkorb ist leer.",
    total: "Gesamt",
    clearCart: "Warenkorb leeren",
    legend: "Legende",
        // cart
    cart_title: "Warenkorb",
    cart_back: "← Zurück zum Menü",
    cart_empty: "Dein Warenkorb ist leer.",
    cart_total: "Gesamt",
    cart_clear: "Warenkorb leeren",
    cart_dips_extra: "Zuschlag für Dips",
    cart_dips_note: "(ab dem 2. Dip)",
  },

  fr: {
    home: "Accueil",
    menu: "Menu",
    cart: "Panier",
    add: "Ajouter",
    emptyCart: "Ton panier est vide.",
    total: "Total",
    clearCart: "Vider le panier",
    legend: "Légende",
        // cart
    cart_title: "Panier",
    cart_back: "← Retour au menu",
    cart_empty: "Ton panier est vide.",
    cart_total: "Total",
    cart_clear: "Vider le panier",
    cart_dips_extra: "Supplément Dips",
    cart_dips_note: "(à partir du 2e dip)",

  },

  en: {
    home: "Home",
    menu: "Menu",
    cart: "Cart",
    add: "Add",
    emptyCart: "Your cart is empty.",
    total: "Total",
    clearCart: "Clear cart",
    legend: "Legend",
        // cart
    cart_title: "Cart",
    cart_back: "← Back to menu",
    cart_empty: "Your cart is empty.",
    cart_total: "Total",
    cart_clear: "Clear cart",
    cart_dips_extra: "Dips surcharge",
    cart_dips_note: "(from the 2nd dip)",

  },
};
