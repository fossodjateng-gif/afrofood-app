"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { staffFetch } from "@/lib/staff-auth";
import type { WorkstationConfig, WorkstationType } from "@/lib/workstations";
type User = { id: string; username: string; role: "admin" | "cashier" | "kitchen"; active: boolean; cashier_event_id: string | null; workstation_id: string | null };
type Draft = { mode: "create" | "edit"; id?: string; username: string; password: string; role: User["role"]; eventId: string; workstationId: string; active: boolean };
const empty: Draft = { mode: "create", username: "", password: "", role: "cashier", eventId: "", workstationId: "", active: true };
const TEXT = {
  fr: { title: "Utilisateurs et postes", source: "Affectations gérées par la session serveur.", loading: "Chargement…", edit: "Modifier", create: "Créer un utilisateur", username: "Utilisateur", password: "Mot de passe", role: "Rôle", event: "Événement", station: "Poste", none: "Aucun", activeAccount: "Compte actif", hint: "Changer le rôle ou l’événement efface la sélection du poste.", save: "Enregistrer", cancel: "Annuler", accounts: "Comptes serveur", unassigned: "Non affecté", active: "Actif", inactive: "Inactif", stations: "Postes par événement", newStation: "Nouveau poste", choose: "Choisir", type: "Type", cashier: "Caisse", kitchen: "Cuisine", name: "Nom", createStation: "Créer le poste", saveStation: "Enregistrer le poste", saved: "Enregistré. Les anciennes sessions concernées doivent se reconnecter.", error: "Vérifiez le compte, le poste et votre session administrateur, puis réessayez." },
  de: { title: "Benutzer und Arbeitsplätze", source: "Zuweisungen werden über die Serversitzung verwaltet.", loading: "Laden…", edit: "Bearbeiten", create: "Benutzer erstellen", username: "Benutzername", password: "Passwort", role: "Rolle", event: "Veranstaltung", station: "Arbeitsplatz", none: "Keiner", activeAccount: "Konto aktiv", hint: "Ein Rollen- oder Veranstaltungswechsel setzt den Arbeitsplatz zurück.", save: "Speichern", cancel: "Abbrechen", accounts: "Serverkonten", unassigned: "Nicht zugewiesen", active: "Aktiv", inactive: "Inaktiv", stations: "Arbeitsplätze je Veranstaltung", newStation: "Neuer Arbeitsplatz", choose: "Auswählen", type: "Typ", cashier: "Kasse", kitchen: "Küche", name: "Name", createStation: "Arbeitsplatz erstellen", saveStation: "Arbeitsplatz speichern", saved: "Gespeichert. Betroffene Sitzungen müssen sich erneut anmelden.", error: "Konto, Arbeitsplatz und Admin-Sitzung prüfen und erneut versuchen." },
  en: { title: "Users and workstations", source: "Assignments are managed through the server session.", loading: "Loading…", edit: "Edit", create: "Create user", username: "Username", password: "Password", role: "Role", event: "Event", station: "Workstation", none: "None", activeAccount: "Active account", hint: "Changing role or event clears the workstation selection.", save: "Save", cancel: "Cancel", accounts: "Server accounts", unassigned: "Unassigned", active: "Active", inactive: "Inactive", stations: "Workstations by event", newStation: "New workstation", choose: "Choose", type: "Type", cashier: "Cashier", kitchen: "Kitchen", name: "Name", createStation: "Create workstation", saveStation: "Save workstation", saved: "Saved. Affected sessions must sign in again.", error: "Check the account, workstation and admin session, then retry." },
};
const panel = { padding: 18, border: "1px solid #ddd", borderRadius: 12, background: "white", marginTop: 16 };
export default function StaffAdminUsersPage() {
  const [lang, setLang] = useState<Lang>(() => getSavedLang());
  const t = TEXT[lang];
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [workstations, setWorkstations] = useState<Record<string, WorkstationConfig>>({});
  const [draft, setDraft] = useState<Draft>(empty);
  const [stationEvent, setStationEvent] = useState("");
  const [stationType, setStationType] = useState<WorkstationType>("cashier");
  const [stationName, setStationName] = useState("");
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
  useEffect(() => { const c = new AbortController(); void load(c.signal).catch(() => { if (!c.signal.aborted) { setError(TEXT.fr.error); setLoading(false); } }); return () => c.abort(); }, [load]);
  async function mutate(url: string, method: string, body: object) {
    setBusy(true); setError(""); setMessage("");
    try { const r = await staffFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || "Enregistrement refusé"); await load(); setMessage(t.saved); return true; }
    catch { setError(t.error); return false; } finally { setBusy(false); }
  }
  const config = workstations[draft.eventId];
  const choices = !config ? [] : draft.role === "admin" ? [...config.cashier, ...config.kitchen] : config[draft.role];
  async function saveUser(event: FormEvent) { event.preventDefault(); if (await mutate("/api/staff/users", draft.mode === "edit" ? "PATCH" : "POST", draft)) setDraft(empty); }
  return <main style={{ maxWidth: 1000, margin: "auto", padding: 24, background: "#fff7ed", minHeight: "100vh" }}>
    <nav aria-label="Language">{(["de", "fr", "en"] as Lang[]).map(l => <button key={l} type="button" className={`af-lang-btn ${lang === l ? "is-active" : ""}`} aria-pressed={lang === l} onClick={() => { setLang(l); saveLang(l); }}>{l.toUpperCase()}</button>)}</nav>
    <a href="/staff/admin">Administration</a><h1 className="af-title">{t.title}</h1><p>{t.source}</p>
    {error ? <p className="af-message af-message-error" role="alert">{t.error}</p> : null}{message ? <p className="af-message af-message-success" role="status">{t.saved}</p> : null}
    {loading ? <p>{t.loading}</p> : <>
    <form onSubmit={saveUser} style={panel}><h2>{draft.mode === "edit" ? `${t.edit} ${draft.username}` : t.create}</h2><fieldset disabled={busy} style={{ display: "grid", gap: 12 }}>
      {draft.mode === "create" ? <><label>{t.username}<input required maxLength={80} autoComplete="off" value={draft.username} onChange={e => setDraft({ ...draft, username: e.target.value })} /></label><label>{t.password}<input required type="password" minLength={12} maxLength={256} autoComplete="new-password" value={draft.password} onChange={e => setDraft({ ...draft, password: e.target.value })} /></label></> : null}
      <label>{t.role}<select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value as User["role"], workstationId: "" })}><option value="admin">Admin</option><option value="cashier">{t.cashier}</option><option value="kitchen">{t.kitchen}</option></select></label>
      <label>{t.event}<select required={draft.role !== "admin"} value={draft.eventId} onChange={e => setDraft({ ...draft, eventId: e.target.value, workstationId: "" })}><option value="">{t.none}</option>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <label>{t.station}<select required={draft.role !== "admin" || !!draft.eventId} value={draft.workstationId} onChange={e => setDraft({ ...draft, workstationId: e.target.value })}><option value="">{t.none}</option>{choices.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}</select></label>
      <label><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} />{t.activeAccount}</label><p>{t.hint}</p><button>{t.save}</button>{draft.mode === "edit" ? <button type="button" onClick={() => setDraft(empty)}>{t.cancel}</button> : null}
    </fieldset></form>
    <section className="af-panel" style={panel}><h2>{t.accounts}</h2><ul>{users.map(u => { const c = u.cashier_event_id ? workstations[u.cashier_event_id] : undefined; const s = c && [...c.cashier, ...c.kitchen].find(s => s.id === u.workstation_id); return <li key={u.id}>{u.username} · {u.role} · {events.find(e => e.id === u.cashier_event_id)?.name || "—"} · {s?.name || t.unassigned} · {u.active ? t.active : t.inactive} <button type="button" disabled={busy} onClick={() => setDraft({ mode: "edit", id: u.id, username: u.username, password: "", role: u.role, active: u.active, eventId: u.cashier_event_id || "", workstationId: s?.active ? s.id : "" })}>{t.edit}</button></li>; })}</ul></section>
    <section className="af-panel" style={panel}><h2>{t.stations}</h2><form onSubmit={async e => { e.preventDefault(); if (await mutate("/api/staff/workstations", "POST", { eventId: stationEvent, type: stationType, name: stationName, active: true })) setStationName(""); }}><fieldset disabled={busy}><legend>{t.newStation}</legend>
      <label>{t.event}<select required value={stationEvent} onChange={e => setStationEvent(e.target.value)}><option value="">{t.choose}</option>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <label>{t.type}<select value={stationType} onChange={e => setStationType(e.target.value as WorkstationType)}><option value="cashier">{t.cashier}</option><option value="kitchen">{t.kitchen}</option></select></label><label>{t.name}<input required maxLength={100} value={stationName} onChange={e => setStationName(e.target.value)} /></label><button>{t.createStation}</button>
    </fieldset></form>{events.map(e => <div key={e.id}><h3>{e.name}</h3>{[...(workstations[e.id]?.cashier || []), ...(workstations[e.id]?.kitchen || [])].map(s => <form key={`${s.id}:${s.name}:${s.active}`} onSubmit={async event => { event.preventDefault(); const f = new FormData(event.currentTarget); await mutate("/api/staff/workstations", "PATCH", { eventId: e.id, id: s.id, type: s.type, name: f.get("name"), active: f.has("active") }); }}><fieldset disabled={busy}><legend>{s.type} · {s.id}</legend><label>{t.name}<input name="name" required maxLength={100} defaultValue={s.name} /></label><label><input name="active" type="checkbox" defaultChecked={s.active} />{t.active}</label><button>{t.saveStation}</button></fieldset></form>)}</div>)}</section>
    </>}
  </main>;
}
