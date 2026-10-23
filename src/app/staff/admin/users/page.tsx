"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { staffFetch } from "@/lib/staff-auth";
import type { WorkstationConfig, WorkstationType } from "@/lib/workstations";
type User = { id: string; username: string; role: "admin" | "cashier" | "kitchen"; active: boolean; cashier_event_id: string | null; workstation_id: string | null };
type Draft = { id?: string; username: string; password: string; role: User["role"]; eventId: string; workstationId: string; active: boolean };
const empty: Draft = { username: "", password: "", role: "cashier", eventId: "", workstationId: "", active: true };
const panel = { padding: 18, border: "1px solid #ddd", borderRadius: 12, background: "white", marginTop: 16 };
export default function StaffAdminUsersPage() {
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
  useEffect(() => { const c = new AbortController(); void load(c.signal).catch(err => { if (!c.signal.aborted) { setError(err.message); setLoading(false); } }); return () => c.abort(); }, [load]);
  async function mutate(url: string, method: string, body: object) {
    setBusy(true); setError(""); setMessage("");
    try { const r = await staffFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || "Enregistrement refusé"); await load(); setMessage("Enregistré. Les anciennes sessions concernées doivent se reconnecter."); return true; }
    catch (err) { setError(err instanceof Error ? err.message : "Enregistrement indisponible"); return false; } finally { setBusy(false); }
  }
  const config = workstations[draft.eventId];
  const choices = !config ? [] : draft.role === "admin" ? [...config.cashier, ...config.kitchen] : config[draft.role];
  async function saveUser(event: FormEvent) { event.preventDefault(); if (await mutate("/api/staff/users", draft.id ? "PATCH" : "POST", draft)) setDraft(empty); }
  return <main style={{ maxWidth: 1000, margin: "auto", padding: 24, background: "#fff7ed", minHeight: "100vh" }}>
    <a href="/staff/admin">Administration</a><h1>Utilisateurs et postes</h1><p>Configuration serveur. Aucun compte local n’est importé.</p>
    {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    {loading ? <p>Chargement…</p> : <>
    <form onSubmit={saveUser} style={panel}><h2>{draft.id ? `Modifier ${draft.username}` : "Créer un utilisateur"}</h2><fieldset disabled={busy} style={{ display: "grid", gap: 12 }}>
      {!draft.id ? <><label>Utilisateur <input required maxLength={80} autoComplete="off" value={draft.username} onChange={e => setDraft({ ...draft, username: e.target.value })} /></label><label>Mot de passe <input required type="password" minLength={12} maxLength={256} autoComplete="new-password" value={draft.password} onChange={e => setDraft({ ...draft, password: e.target.value })} /></label></> : null}
      <label>Rôle <select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value as User["role"], workstationId: "" })}><option value="admin">Admin</option><option value="cashier">Cashier</option><option value="kitchen">Kitchen</option></select></label>
      <label>événement <select required={draft.role !== "admin"} value={draft.eventId} onChange={e => setDraft({ ...draft, eventId: e.target.value, workstationId: "" })}><option value="">Aucun</option>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <label>Poste <select required={draft.role !== "admin" || !!draft.eventId} value={draft.workstationId} onChange={e => setDraft({ ...draft, workstationId: e.target.value })}><option value="">Aucun</option>{choices.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}</select></label>
      <label><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> Compte actif</label><p>Changer le rôle ou l?événement efface la sélection du poste.</p><button>Enregistrer</button>{draft.id ? <button type="button" onClick={() => setDraft(empty)}>Annuler</button> : null}
    </fieldset></form>
    <section style={panel}><h2>Comptes serveur</h2><ul>{users.map(u => { const c = u.cashier_event_id ? workstations[u.cashier_event_id] : undefined; const s = c && [...c.cashier, ...c.kitchen].find(s => s.id === u.workstation_id); return <li key={u.id}>{u.username} · {u.role} · {events.find(e => e.id === u.cashier_event_id)?.name || "—"} · {s?.name || "Non affecté"} · {u.active ? "Actif" : "Inactif"} <button type="button" disabled={busy} onClick={() => setDraft({ id: u.id, username: u.username, password: "", role: u.role, active: u.active, eventId: u.cashier_event_id || "", workstationId: s?.active ? s.id : "" })}>Modifier</button></li>; })}</ul></section>
    <section style={panel}><h2>Postes par événement</h2><form onSubmit={async e => { e.preventDefault(); if (await mutate("/api/staff/workstations", "POST", { eventId: stationEvent, type: stationType, name: stationName, active: true })) setStationName(""); }}><fieldset disabled={busy}><legend>Nouveau poste</legend>
      <label>événement <select required value={stationEvent} onChange={e => setStationEvent(e.target.value)}><option value="">Choisir</option>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <label>Type <select value={stationType} onChange={e => setStationType(e.target.value as WorkstationType)}><option value="cashier">Caisse</option><option value="kitchen">Cuisine</option></select></label><label>Nom <input required maxLength={100} value={stationName} onChange={e => setStationName(e.target.value)} /></label><button>Créer le poste</button>
    </fieldset></form>{events.map(e => <div key={e.id}><h3>{e.name}</h3>{[...(workstations[e.id]?.cashier || []), ...(workstations[e.id]?.kitchen || [])].map(s => <form key={`${s.id}:${s.name}:${s.active}`} onSubmit={async event => { event.preventDefault(); const f = new FormData(event.currentTarget); await mutate("/api/staff/workstations", "PATCH", { eventId: e.id, id: s.id, type: s.type, name: f.get("name"), active: f.has("active") }); }}><fieldset disabled={busy}><legend>{s.type} · {s.id}</legend><label>Nom <input name="name" required maxLength={100} defaultValue={s.name} /></label><label><input name="active" type="checkbox" defaultChecked={s.active} /> Actif</label><button>Enregistrer le poste</button></fieldset></form>)}</div>)}</section>
    </>}
  </main>;
}
