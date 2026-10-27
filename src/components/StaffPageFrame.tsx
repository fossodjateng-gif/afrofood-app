import Image from "next/image";
import type { ReactNode } from "react";
import type { Lang } from "@/lib/translations";
import pos from "@/components/pos/pos.module.css";
import styles from "./staff-page.module.css";

// Reuse the existing POS identity rather than introducing another staff theme.
type StaffPageContext = {
  name: string;
  role: string;
  eventName?: string;
  workstationName?: string;
  globalAdministration?: boolean;
};

const CONTEXT_TEXT = {
  fr: { name: "Nom", role: "Rôle", event: "Événement", workstation: "Poste", context: "Contexte", global: "Administration globale", languages: "Langue", navigation: "Navigation" },
  de: { name: "Name", role: "Rolle", event: "Veranstaltung", workstation: "Arbeitsplatz", context: "Kontext", global: "Globale Administration", languages: "Sprache", navigation: "Navigation" },
  en: { name: "Name", role: "Role", event: "Event", workstation: "Workstation", context: "Context", global: "Global administration", languages: "Language", navigation: "Navigation" },
};

export function StaffPageFrame({ title, subtitle, actions, back, home, context, lang = "fr", onLangChange, wide = false, sticky = false, children }: {
  title: string; subtitle?: string; actions?: ReactNode; back?: ReactNode; home?: ReactNode;
  context?: StaffPageContext; lang?: Lang; onLangChange?: (lang: Lang) => void;
  wide?: boolean; sticky?: boolean; children: ReactNode;
}) {
  const t = CONTEXT_TEXT[lang];
  const hasToolbar = !!(back || home || onLangChange);
  return <main className={pos.page}>
    <div className={`${styles.shell}${wide ? ` ${styles.wideShell}` : ""}`}>
      <header className={`${pos.header}${hasToolbar || context ? ` ${styles.staffHeader}` : ""}${sticky ? ` ${styles.stickyHeader}` : ""}`}>
        {hasToolbar ? <nav className={styles.toolbar} aria-label={t.navigation}>
          <div className={styles.back}>{back}</div>
          {onLangChange ? <div className={styles.languages} role="group" aria-label={t.languages}>
            {(["de", "fr", "en"] as Lang[]).map(language => <button key={language} type="button"
              className={`af-lang-btn ${lang === language ? "is-active" : ""}`} aria-pressed={lang === language}
              onClick={() => onLangChange(language)}>{language.toUpperCase()}</button>)}
          </div> : null}
          <div className={styles.headerActions}>{home}{actions}</div>
        </nav> : null}
        <h1 className={pos.brand}>
          <Image src="/logo-afrofood.png" alt="AfroFood" width={30} height={30} unoptimized className={pos.logo} />
          {title}
        </h1>
        {context ? <dl className={styles.identity}>
          <div><dt>{t.name}</dt><dd>{context.name || "—"}</dd></div>
          <div><dt>{t.role}</dt><dd>{context.role || "—"}</dd></div>
          <div><dt>{context.globalAdministration ? t.context : t.event}</dt><dd>{context.globalAdministration ? t.global : context.eventName || "—"}</dd></div>
          {context.workstationName ? <div><dt>{t.workstation}</dt><dd>{context.workstationName}</dd></div> : null}
        </dl> : null}
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        {!hasToolbar && actions ? <nav className={pos.headerActions}>{actions}</nav> : null}
      </header>
      <div className={pos.separator} aria-hidden="true" />
      {children}
    </div>
  </main>;
}
