"use client";
import { useEffect, useState } from "react";
import { refreshCashierSession, hasTemporaryCashierContext, type CashierSession } from "@/lib/temporary-cashier-client";
import { useTemporaryCashierWorkspace } from "@/components/TemporaryCashierWorkspace";
import { getStaffRoleLabel } from "@/lib/staff-auth";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { StaffPageFrame } from "@/components/StaffPageFrame";
import { StaffNavigationCard } from "@/components/StaffNavigationCard";
import cuisine from "@/components/cuisine.module.css";
import styles from "@/components/cashier-pages.module.css";
export default function StaffCaissePage() {
  const [blocked, setBlocked] = useState(false);
  const [session, setSession] = useState<CashierSession | null>(null);
  const [lang, setLang] = useState<Lang>(() => getSavedLang());
  const [eventLabel, setEventLabel] = useState<{ id: string; name: string } | null>(null);
  const temporary = hasTemporaryCashierContext();
  const temporaryWorkspace = useTemporaryCashierWorkspace();
  const txt = (fr: string, de: string, en: string) => lang === "fr" ? fr : lang === "de" ? de : en;
  useEffect(() => {
    void (async () => {
      const session = await refreshCashierSession();
      if (!session) { window.location.href = "/team/login"; return; }
      if (session.role !== "cashier" && session.role !== "admin") { window.location.href = "/staff"; return; }
      if (!session.cashierEventId || !session.workstationId || session.workstationType !== "cashier") {
        queueMicrotask(() => setBlocked(true)); return;
      }
      setSession(session);
    })().catch(() => setBlocked(true));
  }, []);
  // Display only: assignment and permissions still come from refreshCashierSession.
  useEffect(() => {
    const id = session?.cashierEventId;
    if (!id) return;
    const controller = new AbortController();
    void fetch("/api/menu-config", { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        const events: Array<{ id: string; name: string }> = data?.storeConfig?.events || [];
        const event = events.find(event => event.id === id);
        if (!controller.signal.aborted && event?.name) setEventLabel({ id, name: event.name });
      }).catch(() => { /* Keep the assigned ID as a label fallback. */ });
    return () => controller.abort();
  }, [session?.cashierEventId]);

  const menuHref = (view: string) => `/admin/menu?view=${view}&${temporary ? `adminEventId=${encodeURIComponent(session?.cashierEventId || "")}&returnTo=caisse` : "from=caisse"}`;
  return <div className={cuisine.workspace}>
    <StaffPageFrame title={txt("Espace Caisse", "Kassenbereich", "Cashier space")} lang={lang}
      context={session ? { name: session.username, role: getStaffRoleLabel(session.role, lang),
        eventName: eventLabel && eventLabel.id === session.cashierEventId ? eventLabel.name : session.cashierEventId,
        workstationName: session.workstationName } : undefined}
      back={temporary ? <button type="button" className="af-link-btn" disabled={!temporaryWorkspace} onClick={() => void temporaryWorkspace?.quit()}>{txt("Quitter la caisse / Admin", "Kasse verlassen / Admin", "Leave register / Admin")}</button>
        : <a href="/staff" className="af-link-btn">{txt("Retour", "Zurück", "Back")} · {txt("Espace équipe", "Teambereich", "Team space")}</a>}
      onLangChange={language => { setLang(language); saveLang(language); }}
    >
      {blocked || !session ? <p className={styles.status} role={blocked ? "alert" : "status"}>{blocked
        ? txt("Une affectation serveur valide est requise pour ouvrir cette caisse.", "Eine gültige Serverzuweisung ist erforderlich.", "A valid server assignment is required to open this register.")
        : txt("Chargement de votre espace Caisse…", "Kassenbereich wird geladen…", "Loading your cashier space…")}</p> : <>
        {temporary ? <p className={styles.status}>{txt("Admin · Caisse temporaire : espèces. Terminal et remboursements indisponibles ici.", "Admin · Temporäre Kasse: Barzahlung. Terminal und Erstattungen sind hier nicht verfügbar.", "Admin · Temporary register: cash. Terminal and refunds are unavailable here.")}</p> : null}
        <section className={styles.section} aria-labelledby="cashier-sales">
          <h2 id="cashier-sales">{txt("Vente", "Verkauf", "Sales")}</h2>
          <div className={cuisine.cards}>
            <StaffNavigationCard href="/caisse/manual" icon="＋" title={txt("Caisse manuelle", "Manuelle Kasse", "Manual register")} description={txt("Composer une commande et encaisser.", "Eine Bestellung zusammenstellen und kassieren.", "Create an order and collect payment.")} />
            <StaffNavigationCard href="/caisse" icon="€" title={txt("Commandes et encaissements", "Bestellungen und Zahlungen", "Orders and payments")} description={txt("Traiter les commandes et leurs encaissements.", "Bestellungen und Zahlungen bearbeiten.", "Process orders and their payments.")} />
            <StaffNavigationCard href="/caisse?view=history" disabled={temporary} icon="≡" title={txt("Historique des ventes", "Verkaufshistorie", "Sales history")} description={temporary ? txt("Indisponible dans le contexte Admin temporaire actuel.", "Im temporären Admin-Kontext nicht verfügbar.", "Unavailable in the current temporary Admin context.") : txt("Consulter les ventes validées et leurs reçus.", "Bestätigte Verkäufe und Belege ansehen.", "View confirmed sales and their receipts.")} />
          </div>
        </section>
        <section className={styles.kitchen} aria-labelledby="cashier-kitchen">
          <h2 id="cashier-kitchen">{txt("Cuisine", "Küche", "Kitchen")}</h2>
          <div className={cuisine.cards}><StaffNavigationCard href={temporary ? `/staff/cuisine?adminEventId=${encodeURIComponent(session.cashierEventId || "")}` : "/staff/cuisine?from=caisse"} icon="♨" title={txt("Cuisine", "Küche", "Kitchen")} description={txt("Préparation, commandes prêtes et disponibilité produits.", "Zubereitung, abholbereite Bestellungen und Produktverfügbarkeit.", "Preparation, ready orders and product availability.")} /></div>
        </section>
        <section className={styles.kitchen} aria-labelledby="cashier-config">
          <h2 id="cashier-config">{txt("Catalogue et configuration", "Katalog und Einstellungen", "Catalog and settings")}</h2>
          <div className={cuisine.cards}>
            <StaffNavigationCard href={menuHref("add")} icon="＋" title={txt("Ajouter un produit", "Produkt hinzufügen", "Add a product")} description={txt("Ajouter un produit au catalogue.", "Ein Produkt zum Katalog hinzufügen.", "Add a product to the catalog.")} />
            <StaffNavigationCard href={menuHref("pricing")} icon="€" title={txt("Prix et visibilité", "Preise und Sichtbarkeit", "Prices and visibility")} description={txt("Ajuster les prix et les produits affichés.", "Preise und angezeigte Produkte anpassen.", "Adjust prices and displayed products.")} />
            <StaffNavigationCard href={menuHref("payment")} icon="⚙" title={txt("Modes de paiement", "Zahlungsarten", "Payment methods")} description={txt("Consulter la configuration des paiements.", "Zahlungseinstellungen ansehen.", "View payment settings.")} />
          </div>
        </section>
      </>}
    </StaffPageFrame>
  </div>;
}
