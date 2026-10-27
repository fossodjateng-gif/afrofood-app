"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { getProductImageSource, PRODUCT_IMAGE_FALLBACK } from "@/lib/product-image";
import pos from "./pos.module.css";
import styles from "./product-presentation.module.css";

// Keep the cashier's image sizing and fallback behavior in one place.
export function ProductImage({ imagePath, alt }: { imagePath?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const source = failed ? PRODUCT_IMAGE_FALLBACK : getProductImageSource(imagePath);
  return <div className={pos.productImage}>
    <Image src={source} alt={alt} width={240} height={160} unoptimized
      style={{ objectFit: source === PRODUCT_IMAGE_FALLBACK ? "contain" : "cover" }} onError={() => setFailed(true)} />
  </div>;
}

// Presentation only: each page keeps ownership of its controls and save logic.
export function ProductPresentation({ id, imagePath, name, category, tone = "normal", children }: {
  id: string; imagePath?: string; name: string; category?: string;
  tone?: "normal" | "blocked" | "warning"; children: ReactNode;
}) {
  return <article className={`${styles.card} ${styles[tone]}`}>
    <ProductImage key={`${id}:${imagePath}`} imagePath={imagePath} alt={name} />
    <div className={styles.body}>
      <header className={styles.heading}>
        {category ? <p className={styles.category}>{category}</p> : null}
        <h3 className={styles.name}>{name}</h3>
      </header>
      {children}
    </div>
  </article>;
}
