"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { getSession, getStaffRoleLabel, staffFetch } from "@/lib/staff-auth";
import { StaffPageFrame } from "@/components/StaffPageFrame";
import styles from "@/components/staff-page.module.css";
import cuisine from "@/components/cuisine.module.css";
import userStyles from "./users.module.css";
type User = { id: string; username: string; role: "admin" | "cashier" | "kitchen"; active: boolean; cashier_event_id: string | null; workstation_id: string | null };
type Draft = { mode: "create" | "edit"; id?: string; username: string; password: string; role: User["role"]; eventId: string; active: boolean };
const empty: Draft = { mode: "create", username: "", password: "", role: "cashier", eventId: "", active: true };
const TEXT = {
  fr: { source: "Affectations gérées automatiquement.", loading: "Chargement…", edit: "Modifier", create: "Créer un utilisateur", username: "Utilisateur", password: "Mot de passe", role: "Rôle", event: "Événement", activeAccount: "Compte actif", save: "Enregistrer", cancel: "Annuler", accounts: "Comptes serveur", unassigned: "Non affecté", active: "Actif", inactive: "Inactif", choose: "Choisir", cashier: "Caisse", kitchen: "Cuisine", name: "Nom", saved: "Enregistré. Les anciennes sessions concernées doivent se reconnecter.", error: "Vérifiez le compte, le rôle, l’événement et votre session administrateur, puis réessayez." },
  de: { source: "Zuweisungen werden automatisch verwaltet.", loading: "Laden…", edit: "Bearbeiten", create: "Benutzer erstellen", username: "Benutzername", password: "Passwort", role: "Rolle", event: "Veranstaltung", activeAccount: "Konto aktiv", save: "Speichern", cancel: "Abbrechen", accounts: "Serverkonten", unassigned: "Nicht zugewiesen", active: "Aktiv", inactive: "Inaktiv", choose: "Auswählen", cashier: "Kasse", kitchen: "Küche", name: "Name", saved: "Gespeichert. Betroffene Sitzungen müssen sich erneut anmelden.", error: "Konto, Rolle, Event und Admin-Sitzung prüfen und erneut versuchen." },
  en: { source: "Assignments are managed automatically.", loading: "Loading…", edit: "Edit", create: "Create user", username: "Username", password: "Password", role: "Role", event: "Event", activeAccount: "Active account", save: "Save", cancel: "Cancel", accounts: "Server accounts", unassigned: "Unassigned", active: "Active", inactive: "Inactive", choose: "Choose", cashier: "Cashier", kitchen: "Kitchen", name: "Name", saved: "Saved. Affected sessions must sign in again.", error: "Check the account, role, event and admin session, then retry." },
};
export default function StaffAdminUsersPage() {
  const [lang, setLang] = useState<Lang>(() => getSavedLang());
  const t = TEXT[lang];
  const txt = (fr: string, de: string, en: string) => lang === "fr" ? fr : lang === "de" ? de : en;
  const createdLabel = txt("Utilisateur créé", "Benutzer erstellt", "User created");
  const [created, setCreated] = useState(false);
  const [adminEventId, setAdminEventId] = useState("");
  const [returnEventId, setReturnEventId] = useState("");
  const session = getSession();
  const resetDraft = () => { setDraft({ ...empty, eventId: adminEventId }); setCreated(false); };
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    const [accounts, config] = await Promise.all([staffFetch("/api/staff/users", { cache: "no-store", signal }), staffFetch("/api/staff/workstations", { cache: "no-store", signal })]);
    const [a, c] = await Promise.all([accounts.json(), config.json()]);
    if (!accounts.ok || !config.ok) throw new Error(a.error || c.error || "Accès administrateur requis");
    if (signal?.aborted) return;
    setUsers(a.users); setEvents(c.events); setLoading(false);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("adminEventId") || params.get("returnEventId") || "";
    if (!eventId) { window.location.replace("/admin/menu?view=event&from=admin-events"); return; }
    setAdminEventId(eventId);
    setReturnEventId(new URLSearchParams(window.location.search).get("returnEventId") || "");
    setDraft({ ...empty, eventId });
    const c = new AbortController(); void load(c.signal).catch(() => { if (!c.signal.aborted) { setError(TEXT.fr.error); setLoading(false); } }); return () => c.abort(); }, [load]);
  async function mutate(url: string, method: string, body: object) {
    setBusy(true); setError(""); setMessage("");
    try { const r = await staffFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || "Enregistrement refusé"); await load(); setMessage(t.saved); return true; }
    catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      const assignmentErrors: Record<string, string> = {
        workstation_inactive: txt("La caisse ou cuisine associée est inactive. Vérifiez sa disponibilité avant de réessayer.", "Die zugehörige Kasse oder Küche ist inaktiv. Bitte die Verfügbarkeit prüfen.", "The associated register or kitchen is inactive. Check its availability before retrying."),
        workstation_owner_conflict: txt("Cette caisse ou cuisine appartient à un autre utilisateur. Affectation refusée.", "Diese Kasse oder Küche gehört einem anderen Benutzer. Zuweisung abgelehnt.", "This register or kitchen belongs to another user. Assignment refused."),
        workstation_owner_ambiguous: txt("Plusieurs caisses ou cuisines correspondent à cette affectation. Vérification nécessaire.", "Mehrere Kassen oder Küchen entsprechen dieser Zuweisung. Bitte prüfen.", "Multiple registers or kitchens match this assignment. Review required."),
        workstation_shared_assignment: txt("Cette caisse ou cuisine est aussi affectée à un autre utilisateur. Association refusée.", "Diese Kasse oder Küche ist auch einem anderen Benutzer zugewiesen. Zuordnung abgelehnt.", "This register or kitchen is also assigned to another user. Association refused."),
        staff_assignment_changed_reload: txt("Les affectations ont changé. Rechargez avant de réessayer.", "Die Zuweisungen haben sich geändert. Bitte neu laden.", "Assignments have changed. Reload before retrying."),
      };
      setError(assignmentErrors[code] || t.error); return false;
    } finally { setBusy(false); }
  }
  async function saveUser(event: FormEvent) {
    event.preventDefault();
    const creating = draft.mode === "create";
    setCreated(false);
    if (await mutate("/api/staff/users", creating ? "POST" : "PATCH", draft)) {
      resetDraft();
      if (creating) { setCreated(true); setMessage(createdLabel); }
    }
  }
  const contextEvent = events.find(e => e.id === adminEventId);
  const backEventId = adminEventId || returnEventId;
  const backHref = backEventId ? `/staff/admin/events?eventId=${encodeURIComponent(backEventId)}` : "/admin/menu?view=event&from=admin-events";
  const backLabel = lang === "fr" ? "Retour" : lang === "de" ? "Zurück" : "Back";
  return <div className={`${cuisine.workspace} ${userStyles.page}`}>
  <StaffPageFrame title={txt("Utilisateurs", "Benutzer", "Users")} lang={lang}
    context={{ name: session?.username || "", role: session ? getStaffRoleLabel(session.role, lang) : "", eventName: contextEvent?.name || adminEventId, globalAdministration: !adminEventId }}
    onLangChange={language => { setLang(language); saveLang(language); }}
    back={<a className="af-link-btn" href={backHref}>{backLabel} · {backEventId ? (lang === "fr" ? "Événement Admin" : lang === "de" ? "Eventverwaltung" : "Event admin") : "Administration"}</a>}
  >
    <p>{t.source}</p>
    {error ? <p className="af-message af-message-error" role="alert">{error}</p> : null}{message ? <p className="af-message af-message-success" role="status">{message}</p> : null}
    {loading ? <p className="af-message" role="status">{t.loading}</p> : !contextEvent ? <p role="alert">{t.error}</p> : <>
    <form id="user-editor" onSubmit={saveUser} onChangeCapture={() => setCreated(false)} className="af-panel"><h2>{draft.mode === "edit" ? `${t.edit} ${draft.username}` : t.create}</h2><fieldset disabled={busy} className={styles.formFields}>
      {draft.mode === "create" ? <><label>{t.username}<input required maxLength={80} autoComplete="off" value={draft.username} onChange={e => setDraft({ ...draft, username: e.target.value })} /></label><label>{t.password}<input required type="password" minLength={12} maxLength={256} autoComplete="new-password" value={draft.password} onChange={e => setDraft({ ...draft, password: e.target.value })} /></label></> : null}
      {draft.mode === "edit" ? <p>{t.username} : <strong>{draft.username}</strong></p> : null}
      <label>{t.role}<select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value as User["role"] })}><option value="admin">Admin</option><option value="cashier">{t.cashier}</option><option value="kitchen">{t.kitchen}</option></select></label>
      {draft.role === "admin" ? <p>{txt("Admin : aucune affectation opérationnelle permanente.", "Admin: keine feste operative Zuweisung.", "Admin: no permanent operational assignment.")}</p> : <label>{t.event}<select required value={draft.eventId} onChange={e => setDraft({ ...draft, eventId: e.target.value })}>
        <option value="">{t.choose}</option>{events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
      </select></label>}
      <label><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} />{t.activeAccount}</label><p>{txt("L’affectation est gérée automatiquement selon l’utilisateur, le rôle et l’événement.", "Die Zuweisung wird je nach Benutzer, Rolle und Event automatisch verwaltet.", "The assignment is managed automatically for the user, role and event.")}</p>
      <button type="submit" className={userStyles.save} data-created={created || undefined}>{created ? createdLabel : draft.mode === "create" ? t.create : t.save}</button>
      {draft.mode === "edit" ? <button type="button" onClick={() => resetDraft()}>{t.cancel}</button> : null}
    </fieldset></form>
    <section className="af-panel"><h2>{t.accounts}</h2>
      <ul className={userStyles.accounts}>{users.filter(u => !adminEventId || u.role === "admin" || u.cashier_event_id === adminEventId).map(u => {
        return <li key={u.id} className={userStyles.account}>
          <h3>{u.username}</h3>
          <dl>
            <div><dt>{t.name}</dt><dd>{u.username}</dd></div>
            <div><dt>{t.role}</dt><dd>{getStaffRoleLabel(u.role, lang)}</dd></div>
            <div><dt>{t.event}</dt><dd>{events.find(e => e.id === u.cashier_event_id)?.name || t.unassigned}</dd></div>
            <div><dt>{t.activeAccount}</dt><dd>{u.active ? t.active : t.inactive}</dd></div>
          </dl>
          <button type="button" className="af-link-btn" disabled={busy} onClick={() => {
            setCreated(false);
            setDraft({ mode: "edit", id: u.id, username: u.username, password: "", role: u.role, active: u.active, eventId: u.cashier_event_id || adminEventId });
            document.getElementById("user-editor")?.scrollIntoView({ block: "start" });
          }}>{t.edit}</button>
        </li>;
      })}</ul>
      <p>{txt("Le changement de mot de passe et la suppression de compte ne sont pas disponibles dans la gestion serveur actuelle.", "Passwortwechsel und Kontolöschung werden von der aktuellen Serververwaltung nicht unterstützt.", "Password changes and account deletion are not supported by the current server management.")}</p>
    </section>
    </>}
  </StaffPageFrame>
  </div>;
}
