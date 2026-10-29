"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { getSession, getStaffRoleLabel, staffFetch } from "@/lib/staff-auth";
import { StaffPageFrame } from "@/components/StaffPageFrame";
import styles from "@/components/staff-page.module.css";
import cuisine from "@/components/cuisine.module.css";
import userStyles from "./users.module.css";
import type { WorkstationConfig } from "@/lib/workstations";
type User = { id: string; username: string; role: "admin" | "cashier" | "kitchen"; active: boolean; cashier_event_id: string | null; workstation_id: string | null };
type Draft = { mode: "create" | "edit"; id?: string; username: string; password: string; role: User["role"]; eventId: string; active: boolean };
const empty: Draft = { mode: "create", username: "", password: "", role: "cashier", eventId: "", active: true };
const TEXT = {
  fr: { title: "Utilisateurs et postes", source: "Affectations gérées par la session serveur.", loading: "Chargement…", edit: "Modifier", create: "Créer un utilisateur", username: "Utilisateur", password: "Mot de passe", role: "Rôle", event: "Événement", station: "Poste", none: "Aucun", activeAccount: "Compte actif", hint: "Changer le rôle ou l’événement efface la sélection du poste.", save: "Enregistrer", cancel: "Annuler", accounts: "Comptes serveur", unassigned: "Non affecté", active: "Actif", inactive: "Inactif", stations: "Postes par événement", newStation: "Nouveau poste", choose: "Choisir", type: "Type", cashier: "Caisse", kitchen: "Cuisine", name: "Nom", createStation: "Créer le poste", saveStation: "Enregistrer le poste", saved: "Enregistré. Les anciennes sessions concernées doivent se reconnecter.", error: "Vérifiez le compte, le poste et votre session administrateur, puis réessayez." },
  de: { title: "Benutzer und Arbeitsplätze", source: "Zuweisungen werden über die Serversitzung verwaltet.", loading: "Laden…", edit: "Bearbeiten", create: "Benutzer erstellen", username: "Benutzername", password: "Passwort", role: "Rolle", event: "Veranstaltung", station: "Arbeitsplatz", none: "Keiner", activeAccount: "Konto aktiv", hint: "Ein Rollen- oder Veranstaltungswechsel setzt den Arbeitsplatz zurück.", save: "Speichern", cancel: "Abbrechen", accounts: "Serverkonten", unassigned: "Nicht zugewiesen", active: "Aktiv", inactive: "Inaktiv", stations: "Arbeitsplätze je Veranstaltung", newStation: "Neuer Arbeitsplatz", choose: "Auswählen", type: "Typ", cashier: "Kasse", kitchen: "Küche", name: "Name", createStation: "Arbeitsplatz erstellen", saveStation: "Arbeitsplatz speichern", saved: "Gespeichert. Betroffene Sitzungen müssen sich erneut anmelden.", error: "Konto, Arbeitsplatz und Admin-Sitzung prüfen und erneut versuchen." },
  en: { title: "Users and workstations", source: "Assignments are managed through the server session.", loading: "Loading…", edit: "Edit", create: "Create user", username: "Username", password: "Password", role: "Role", event: "Event", station: "Workstation", none: "None", activeAccount: "Active account", hint: "Changing role or event clears the workstation selection.", save: "Save", cancel: "Cancel", accounts: "Server accounts", unassigned: "Unassigned", active: "Active", inactive: "Inactive", stations: "Workstations by event", newStation: "New workstation", choose: "Choose", type: "Type", cashier: "Cashier", kitchen: "Kitchen", name: "Name", createStation: "Create workstation", saveStation: "Save workstation", saved: "Saved. Affected sessions must sign in again.", error: "Check the account, workstation and admin session, then retry." },
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
  const [workstations, setWorkstations] = useState<Record<string, WorkstationConfig>>({});
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
    setUsers(a.users); setEvents(c.events); setWorkstations(c.workstations); setLoading(false);
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
        workstation_inactive: txt("Le poste associé est inactif. Réactivez-le avant de réessayer.", "Der zugehörige Arbeitsplatz ist inaktiv. Bitte zuerst reaktivieren.", "The associated workstation is inactive. Reactivate it before retrying."),
        workstation_owner_conflict: txt("Ce poste appartient à un autre utilisateur. Affectation refusée.", "Dieser Arbeitsplatz gehört einem anderen Benutzer. Zuweisung abgelehnt.", "This workstation belongs to another user. Assignment refused."),
        workstation_owner_ambiguous: txt("Plusieurs postes correspondent à cette affectation. Vérification nécessaire.", "Mehrere Arbeitsplätze entsprechen dieser Zuweisung. Bitte prüfen.", "Multiple workstations match this assignment. Review required."),
        workstation_shared_assignment: txt("Ce poste est aussi affecté à un autre utilisateur. Adoption refusée.", "Dieser Arbeitsplatz ist auch einem anderen Benutzer zugewiesen. Übernahme abgelehnt.", "This workstation is also assigned to another user. Adoption refused."),
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
      <label><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} />{t.activeAccount}</label><p>{txt("Le poste est créé ou réutilisé automatiquement selon l’utilisateur, le rôle et l’événement.", "Der Arbeitsplatz wird je nach Benutzer, Rolle und Event automatisch erstellt oder wiederverwendet.", "The workstation is created or reused automatically for the user, role and event.")}</p>
      <button type="submit" className={userStyles.save} data-created={created || undefined}>{created ? createdLabel : draft.mode === "create" ? t.create : t.save}</button>
      {draft.mode === "edit" ? <button type="button" onClick={() => resetDraft()}>{t.cancel}</button> : null}
    </fieldset></form>
    <section className="af-panel"><h2>{t.accounts}</h2>
      <ul className={userStyles.accounts}>{users.filter(u => !adminEventId || u.role === "admin" || u.cashier_event_id === adminEventId).map(u => {
        const c = u.cashier_event_id ? workstations[u.cashier_event_id] : undefined;
        const s = c && [...c.cashier, ...c.kitchen].find(s => s.id === u.workstation_id);
        return <li key={u.id} className={userStyles.account}>
          <h3>{u.username}</h3>
          <dl>
            <div><dt>{t.name}</dt><dd>{u.username}</dd></div>
            <div><dt>{t.role}</dt><dd>{getStaffRoleLabel(u.role, lang)}</dd></div>
            <div><dt>{t.event}</dt><dd>{events.find(e => e.id === u.cashier_event_id)?.name || t.unassigned}</dd></div>
            <div><dt>{t.station}</dt><dd>{s?.name || t.unassigned}</dd></div>
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
