import Image from "next/image";
import type { ReactNode } from "react";
import pos from "@/components/pos/pos.module.css";
import styles from "./staff-page.module.css";

// Reuse the existing POS identity rather than introducing another staff theme.
export function StaffPageFrame({ title, actions, children }: {
  title: string; actions?: ReactNode; children: ReactNode;
}) {
  return <main className={pos.page}>
    <div className={styles.shell}>
      <header className={pos.header}>
        <h1 className={pos.brand}>
          <Image src="/logo-afrofood.png" alt="AfroFood" width={30} height={30} unoptimized className={pos.logo} />
          {title}
        </h1>
        {actions ? <nav className={pos.headerActions}>{actions}</nav> : null}
      </header>
      <div className={pos.separator} aria-hidden="true" />
      {children}
    </div>
  </main>;
}
