import Link from "next/link";
import styles from "./cuisine.module.css";

// Plain links preserve full document navigation when entering or leaving a V3 register.
export function StaffNavigationCard({ href, icon, title, description, disabled = false, navigation = "document" }: {
  href: string; icon: string; title: string; description: string; disabled?: boolean; navigation?: "document" | "client";
}) {
  const content = <>
    <span className={styles.cardIcon} aria-hidden="true">{icon}</span>
    <span className={styles.cardBody}><strong>{title}</strong><span>{description}</span></span>
    <span aria-hidden="true">{disabled ? "—" : "→"}</span>
  </>;
  if (navigation === "client" && !disabled) {
    return <Link href={href} className={`af-link-btn ${styles.card}`}>{content}</Link>;
  }
  return <a href={disabled ? undefined : href} role={disabled ? "link" : undefined} aria-disabled={disabled || undefined}
    className={`af-link-btn ${styles.card}`} style={disabled ? { opacity: 0.65, boxShadow: "none", transform: "none", cursor: "default" } : undefined}>
    {content}
  </a>;
}
