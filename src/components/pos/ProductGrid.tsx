import Image from "next/image";
import { getProductImageSource, PRODUCT_IMAGE_FALLBACK } from "@/lib/product-image";
import { getDipPriceLabel, isDipItem } from "@/lib/pricing";
import { useState } from "react";
import type { Lang } from "@/lib/translations";
import { formatPosMoney, getProductLimit, type PosProduct, type PosSection } from "@/lib/pos-cart";
import styles from "./pos.module.css";

function ProductImage({ product }: { product: PosProduct }) {
  const [failed, setFailed] = useState(false);
  const source = failed ? PRODUCT_IMAGE_FALLBACK : getProductImageSource(product.imagePath);
  return (
    <div className={styles.productImage}>
      <Image src={source} alt={product.name.de} width={240} height={160} unoptimized style={{ objectFit: source === PRODUCT_IMAGE_FALLBACK ? "contain" : "cover" }} onError={() => setFailed(true)} />
    </div>
  );
}

export function ProductGrid({ lang, sections, categoryId, quantities, onCategoryChange, onAdd }: {
  lang: Lang;
  sections: PosSection[];
  categoryId: string;
  quantities: Map<string, number>;
  onCategoryChange: (id: string) => void;
  onAdd: (product: PosProduct) => void;
}) {
  const displayed = categoryId ? sections.filter((section) => section.id === categoryId) : sections;
  const text = {
    de: { all: "Alle Produkte", empty: "Für dieses Event sind keine sichtbaren Produkte vorhanden.", blocked: "Nicht verfügbar", soldOut: "Ausverkauft", available: "Verfügbar", remaining: "verfügbar", inCart: "im Korb", add: "zum Warenkorb hinzufügen" },
    fr: { all: "Tous les produits", empty: "Aucun produit visible pour cet événement.", blocked: "Indisponible", soldOut: "Épuisé", available: "Disponible", remaining: "disponible(s)", inCart: "au panier", add: "ajouter au panier" },
    en: { all: "All products", empty: "No visible products for this event.", blocked: "Unavailable", soldOut: "Sold out", available: "Available", remaining: "remaining", inCart: "in cart", add: "add to cart" },
  }[lang];
  return (
    <section className={styles.catalog} aria-label="Produkte">
      <div className={styles.categoryBar} role="group" aria-label="Produktkategorien">
        <button className="af-btn" type="button" aria-pressed={!categoryId} onClick={() => onCategoryChange("")}>{text.all}</button>
        {sections.map((section) => (
          <button className="af-btn" key={section.id} type="button" aria-pressed={categoryId === section.id} onClick={() => onCategoryChange(section.id)}>{section.title[lang]}</button>
        ))}
      </div>
      {sections.length === 0 ? <div className={styles.empty}>{text.empty}</div> : null}
      <div className={styles.productGrid}>
            {displayed.flatMap((section) => section.items).map((product) => {
              const isDip = isDipItem({ ...product, name: product.name[lang] });
              const limit = getProductLimit(product);
              const quantity = quantities.get(product.id) || 0;
              const disabled = quantity >= limit;
              const label = product.availability?.status === "blocked" ? text.blocked
                : limit === 0 ? text.soldOut
                : Number.isFinite(limit) ? `${limit} ${text.remaining}` : text.available;
              return (
                <button className={styles.productCard} key={product.id} type="button" disabled={disabled}
                  onClick={() => onAdd(product)} aria-label={`${product.name[lang]} ${text.add}`}>
                  <ProductImage key={`${product.id}:${product.imagePath}`} product={product} />
                  <div className={styles.productBody}>
                    <span className={styles.productName}>{product.name[lang]}</span>
                    <span className={styles.availability}>{label}{quantity > 0 ? ` · ${quantity} ${text.inCart}` : ""}</span>
                    <div className={styles.productBottom}>
                      <strong style={isDip ? { fontSize: 12, lineHeight: 1.5 } : undefined}>{isDip ? getDipPriceLabel(lang) : formatPosMoney(Math.round(product.price * 100))}</strong>
                      <span className={styles.addBadge} aria-hidden="true">+</span>
                    </div>
                  </div>
                </button>
              );
            })}
      </div>
    </section>
  );
}
