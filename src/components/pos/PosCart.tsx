import { formatPosMoney, getPosBreakdown, getProductLimit, type PosCartItem, type PosProduct } from "@/lib/pos-cart";
import styles from "./pos.module.css";
import { getDipPriceLabel, isDipItem } from "@/lib/pricing";
import { translations, type Lang } from "@/lib/translations";

export function PosCart({ lang, items, products, onIncrease, onDecrease, onRemove, onCash, cashDisabled, onCard, cardDisabled }: {
  onCard: () => void;
  cardDisabled: boolean;
  onCash: () => void;
  cashDisabled: boolean;
  lang: Lang;
  items: PosCartItem[];
  products: Map<string, PosProduct>;
  onIncrease: (product: PosProduct) => void;
  onDecrease: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const breakdown = getPosBreakdown(items);
  const count = items.reduce((sum, item) => sum + item.qty, 0);
  const t = translations[lang];
  const text = {
    de: { articles: "Artikel", newOrder: "Neue Bestellung", addHint: "Produkt antippen, um es hinzuzufügen.", remove: "Entfernen", unit: "Stück", warning: "Nicht mehr in dieser Menge verfügbar. Bitte reduzieren oder entfernen.", decrease: "Menge verringern", increase: "Menge erhöhen", dips: "Dips werden nach der aktuellen Menüberechnung angezeigt.", checkout: "Checkout folgt im nächsten Schritt. Es wird keine Bestellung erstellt und keine Zahlung ausgelöst." },
    fr: { articles: "articles", newOrder: "Nouvelle commande", addHint: "Touchez un produit pour l’ajouter.", remove: "Supprimer", unit: "unité", warning: "Cette quantité n’est plus disponible. Réduisez-la ou supprimez l’article.", decrease: "réduire la quantité", increase: "augmenter la quantité", dips: "Dips calculés selon le menu actuel.", checkout: "Le paiement sera activé à la prochaine étape. Aucune commande ni aucun paiement n’est créé." },
    en: { articles: "items", newOrder: "New order", addHint: "Tap a product to add it.", remove: "Remove", unit: "unit", warning: "This quantity is no longer available. Reduce it or remove the item.", decrease: "decrease quantity", increase: "increase quantity", dips: "Dips follow the current menu calculation.", checkout: "Checkout will be enabled in the next step. No order or payment is created." },
  }[lang];
  return (
    <aside className={styles.cart} aria-label={t.cart}>
      <div className={styles.cartHeader}><h2>{t.cart}</h2><span>{count} {text.articles}</span></div>
      <div className={styles.cartLines}>
        {items.length === 0 ? (
          <div className={styles.empty}><span className={styles.emptyIcon} aria-hidden="true">🛒</span><strong>{text.newOrder}</strong><p>{text.addHint}</p></div>
        ) : items.map((item, index) => {
          const product = products.get(item.id);
          const name = product?.name[lang] || item.name;
          const limit = product ? getProductLimit(product) : 0;
          const unavailable = item.qty > limit;
          return (
            <div key={item.id} className={styles.cartLine}>
              <div className={styles.lineHeading}><strong>{name}</strong><button className={styles.removeButton} type="button" onClick={() => onRemove(item.id)} aria-label={`${name} ${lang === "de" ? "entfernen" : text.remove}`}>{text.remove}</button></div>
              <div className={styles.unitPrice}>{isDipItem(item) ? getDipPriceLabel(lang) : `${formatPosMoney(Math.round(item.price * 100))} / ${text.unit}`}</div>
              {unavailable ? <p className={styles.lineWarning}>{text.warning}</p> : null}
              <div className={styles.lineBottom}>
                <div className={styles.quantityControls}>
                  <button className="af-btn" type="button" onClick={() => onDecrease(item.id)} aria-label={`${name}: ${text.decrease}`}>−</button>
                  <span aria-label="Menge">{item.qty}</span>
                  <button className="af-btn" type="button" disabled={!product || item.qty >= limit} onClick={() => product && onIncrease(product)} aria-label={`${name}: ${text.increase}`}>+</button>
                </div>
                <strong>{formatPosMoney(breakdown.lineTotalsCents[index])}</strong>
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.cartFooter}>
        <div className={styles.total} aria-live="polite"><span>{t.total}</span><strong>{formatPosMoney(breakdown.totalCents)}</strong></div>
        <p className={styles.pricingNote}>{getDipPriceLabel(lang)}</p>
        <div className={styles.paymentButtons}>
          <button className="af-btn" type="button" disabled={cashDisabled} onClick={onCash}>Barzahlung</button>
          <button className="af-btn" type="button" disabled={cardDisabled} onClick={onCard}>Kartenzahlung</button>
        </div>
        <p className={styles.checkoutNote}>Kartenzahlung ist noch nicht verfügbar.</p>
      </div>
    </aside>
  );
}
