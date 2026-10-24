"use client";

import { useEffect, useState } from "react";
import { getSavedLang, type Lang } from "@/lib/translations";
import { StaffPageFrame } from "@/components/StaffPageFrame";
import styles from "./staff-page.module.css";

const TEXT = {
  de: { title: "AfroFood · Mitarbeiter", loading: "Sitzung wird geprüft…", cashier: "Kasse wird geprüft…", session: "Die Sitzung ist nicht verfügbar. Bitte erneut anmelden oder die Seite neu laden.", assignment: "Diesem Konto ist keine gültige Veranstaltung mit Kassenarbeitsplatz zugewiesen. Bitte die Administration kontaktieren.", lock: "Die Kasse ist nicht verfügbar oder die Kassensperre ist abgelaufen. Bitte zur Übersicht zurückkehren und die Kasse erneut öffnen.", unavailable: "Die Kasse konnte nicht bestätigt werden. Bitte die Verbindung prüfen und erneut versuchen.", expired: "Bitte anmelden. Die Sitzung fehlt oder ist abgelaufen.", login: "Anmelden", back: "Zurück zur Übersicht", reload: "Seite neu laden" },
  fr: { title: "AfroFood · Équipe", loading: "Vérification de la session…", cashier: "Vérification de la caisse…", session: "La session est indisponible. Reconnectez-vous ou rechargez la page.", assignment: "Ce compte n’a pas d’événement et de poste de caisse valides. Contactez l’administration pour vérifier son affectation.", lock: "La caisse est indisponible ou son verrou a expiré. Revenez à l’accueil équipe, puis ouvrez à nouveau la caisse.", unavailable: "La caisse n’a pas pu être confirmée. Vérifiez la connexion et réessayez.", expired: "Connectez-vous. La session est absente ou a expiré.", login: "Se reconnecter", back: "Retour à l’accueil équipe", reload: "Recharger la page" },
  en: { title: "AfroFood · Team", loading: "Checking your session…", cashier: "Checking the register…", session: "Your session is unavailable. Sign in again or reload the page.", assignment: "This account has no valid event and cashier workstation assignment. Contact administration to check the assignment.", lock: "The register is unavailable or its lease has expired. Return to the team home and open the register again.", unavailable: "The register could not be confirmed. Check your connection and try again.", expired: "Please sign in. Your session is missing or has expired.", login: "Sign in again", back: "Back to team home", reload: "Reload page" },
};

export function StaffAccessState({ kind, error, absent = false }: {
  kind: "session" | "cashier"; error?: string | null; absent?: boolean;
}) {
  const [lang, setLang] = useState<Lang>("de");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try { setLang(getSavedLang()); } catch { /* Access errors must render even without browser storage. */ }
    });
    return () => { active = false; };
  }, []);
  const t = TEXT[lang];
  const blocked = !!error || absent;
  // Technical codes remain in the caller's state; never render server messages.
  const message = absent ? t.expired : !error ? (kind === "session" ? t.loading : t.cashier)
    : /session_required|session_expired/.test(error) ? t.expired
    : kind === "session" ? t.session
    : /workstation|assignment|context_changed/.test(error) ? t.assignment
    : /cashier_lock|cashier_locked/.test(error) ? t.lock : t.unavailable;
  return <StaffPageFrame title={t.title}>
    <section className="af-panel" aria-busy={!blocked}>
      <p className={`af-message ${blocked ? "af-message-warning" : ""}`} role={blocked ? "alert" : "status"}>{message}</p>
      {blocked ? <div className={styles.actions}>
        <a className="af-link-btn af-primary" href="/team/login">{t.login}</a>
        <a className="af-link-btn" href="/staff">{t.back}</a>
        <button type="button" onClick={() => window.location.reload()}>{t.reload}</button>
      </div> : null}
    </section>
  </StaffPageFrame>;
}
