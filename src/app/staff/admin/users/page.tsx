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
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const passwordLabel = txt("Changer le mot de passe", "Passwort ändern", "Change password");
  useEffect(() => {
    if (passwordTarget) document.getElementById("password-editor")?.scrollIntoView({ block: "start" });
  }, [passwordTarget]);
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
        cannot_disable_current_admin: txt("Vous ne pouvez pas désactiver ou rétrograder votre propre compte Admin.", "Sie können Ihr eigenes Admin-Konto nicht deaktivieren oder herabstufen.", "You cannot deactivate or demote your own Admin account."),
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
    const previous = users.find(user => user.id === draft.id);
    if (previous?.active && !draft.active && !window.confirm(txt(`Désactiver ${previous.username} ? Ses sessions seront révoquées. L’historique sera conservé.`, `${previous.username} deaktivieren? Sitzungen werden widerrufen. Die Historie bleibt erhalten.`, `Deactivate ${previous.username}? Sessions will be revoked. History will be preserved.`))) return;
    const creating = draft.mode === "create";
    setCreated(false);
    if (await mutate("/api/staff/users", creating ? "POST" : "PATCH", draft)) {
      resetDraft();
      if (creating) { setCreated(true); setMessage(createdLabel); }
    }
  }
  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (!passwordTarget || busy) return;
    if (newPassword !== passwordConfirmation) { setError(txt("Les mots de passe ne correspondent pas.", "Die Passwörter stimmen nicht überein.", "Passwords do not match.")); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await staffFetch("/api/staff/users/password", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: passwordTarget.id, password: newPassword, confirmation: passwordConfirmation }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("password_change_failed");
      setNewPassword(""); setPasswordConfirmation(""); setPasswordTarget(null);
      setMessage(txt("Mot de passe changé. Les sessions de cet utilisateur sont révoquées.", "Passwort geändert. Die Sitzungen dieses Benutzers wurden widerrufen.", "Password changed. This user's sessions have been revoked."));
      if (passwordTarget.id === session?.userId) window.location.href = "/team/login";
    } catch { setError(t.error); }
    finally { setBusy(false); }
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
      <label>{t.role}<select disabled={draft.id === session?.userId} value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value as User["role"] })}><option value="admin">Admin</option><option value="cashier">{t.cashier}</option><option value="kitchen">{t.kitchen}</option></select></label>
      {draft.role === "admin" ? <p>{txt("Admin : aucune affectation opérationnelle permanente.", "Admin: keine feste operative Zuweisung.", "Admin: no permanent operational assignment.")}</p> : <label>{t.event}<select required value={draft.eventId} onChange={e => setDraft({ ...draft, eventId: e.target.value })}>
        <option value="">{t.choose}</option>{events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
      </select></label>}
      <label><input type="checkbox" disabled={draft.id === session?.userId} checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} />{t.activeAccount}</label><p>{txt("L’affectation est gérée automatiquement selon l’utilisateur, le rôle et l’événement.", "Die Zuweisung wird je nach Benutzer, Rolle und Event automatisch verwaltet.", "The assignment is managed automatically for the user, role and event.")}</p>
      <button type="submit" className={userStyles.save} data-created={created || undefined}>{created ? createdLabel : draft.mode === "create" ? t.create : t.save}</button>
      {draft.mode === "edit" ? <button type="button" onClick={() => resetDraft()}>{t.cancel}</button> : null}
    </fieldset></form>
    {passwordTarget ? <form id="password-editor" className="af-panel" onSubmit={savePassword}>
      <h2>{passwordLabel} : {passwordTarget.username}</h2>
      <fieldset disabled={busy} className={styles.formFields}>
        <label>{txt("Nouveau mot de passe (12 à 256 caractères)", "Neues Passwort (12 bis 256 Zeichen)", "New password (12 to 256 characters)")}<input required type="password" minLength={12} maxLength={256} autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
        <label>{txt("Confirmer le nouveau mot de passe", "Neues Passwort bestätigen", "Confirm new password")}<input required type="password" minLength={12} maxLength={256} autoComplete="new-password" value={passwordConfirmation} onChange={e => setPasswordConfirmation(e.target.value)} /></label>
        <p>{txt("Les sessions de cet utilisateur seront révoquées. Il devra se reconnecter.", "Die Sitzungen dieses Benutzers werden widerrufen. Eine erneute Anmeldung ist erforderlich.", "This user's sessions will be revoked. They will need to sign in again.")}</p>
        <button type="submit">{passwordLabel}</button>
        <button type="button" onClick={() => { setPasswordTarget(null); setNewPassword(""); setPasswordConfirmation(""); }}>{t.cancel}</button>
      </fieldset>
    </form> : null}
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
          <button type="button" className="af-link-btn" disabled={busy} onClick={() => { setPasswordTarget(u); setNewPassword(""); setPasswordConfirmation(""); setError(""); setMessage(""); }}>{passwordLabel}</button>
        </li>;
      })}</ul>
      <p>{txt("La suppression physique est désactivée pour préserver les références historiques. Pour retirer l’accès, modifiez le compte et décochez « Compte actif ».", "Physisches Löschen ist zum Schutz historischer Verweise deaktiviert. Bearbeiten Sie das Konto und deaktivieren Sie „Konto aktiv“.", "Physical deletion is disabled to preserve historical references. Edit the account and clear “Active account” to remove access.")}</p>
    </section>
    </>}
  </StaffPageFrame>
  </div>;
}
