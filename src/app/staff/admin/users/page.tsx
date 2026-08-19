"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createUser,
  deleteUser,
  getSession,
  getStaffRoleLabel,
  getUsers,
  type StaffRole,
  type StaffUser,
  updateUser,
} from "@/lib/staff-auth";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { goBackOr } from "@/lib/client-nav";

const UI_TEXT: Record<
  Lang,
  {
    title: string;
    back: string;
    createUser: string;
    username: string;
    password: string;
    create: string;
    createError: string;
    roleAdmin: string;
    roleCashier: string;
    roleKitchen: string;
    activate: string;
    deactivate: string;
    resetPassword: string;
    changePassword: string;
    newPasswordPlaceholder: string;
    deleteUser: string;
    active: string;
    inactive: string;
  }
> = {
  fr: {
    title: "Utilisateurs",
    back: "Retour",
    createUser: "Creer un utilisateur",
    username: "Nom d'utilisateur",
    password: "Mot de passe",
    create: "Creer",
    createError: "Erreur creation",
    roleAdmin: "Admin",
    roleCashier: "Caisse",
    roleKitchen: "Cuisine",
    activate: "Activer",
    deactivate: "Desactiver",
    resetPassword: "Reset MDP (0603)",
    changePassword: "Changer MDP",
    newPasswordPlaceholder: "Nouveau mot de passe",
    deleteUser: "Supprimer",
    active: "Actif",
    inactive: "Inactif",
  },
  de: {
    title: "Benutzer",
    back: "Zuruck",
    createUser: "Benutzer anlegen",
    username: "Benutzername",
    password: "Passwort",
    create: "Anlegen",
    createError: "Fehler beim Anlegen",
    roleAdmin: "Admin",
    roleCashier: "Kasse",
    roleKitchen: "Kuche",
    activate: "Aktivieren",
    deactivate: "Deaktivieren",
    resetPassword: "Passwort reset (0603)",
    changePassword: "Passwort andern",
    newPasswordPlaceholder: "Neues Passwort",
    deleteUser: "Loschen",
    active: "Aktiv",
    inactive: "Inaktiv",
  },
  en: {
    title: "Users",
    back: "Back",
    createUser: "Create user",
    username: "Username",
    password: "Password",
    create: "Create",
    createError: "Create error",
    roleAdmin: "Admin",
    roleCashier: "Cashier",
    roleKitchen: "Kitchen",
    activate: "Activate",
    deactivate: "Deactivate",
    resetPassword: "Reset password (0603)",
    changePassword: "Change password",
    newPasswordPlaceholder: "New password",
    deleteUser: "Delete",
    active: "Active",
    inactive: "Inactive",
  },
};

export default function StaffAdminUsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("cashier");
  const [cashierEventId, setCashierEventId] = useState("");
  const [eventOptions, setEventOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [sessionRole, setSessionRole] = useState<StaffRole | null>(null);
  const [lang, setLang] = useState<Lang>("fr");
  const [error, setError] = useState<string | null>(null);
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setLang(getSavedLang());
    const s = getSession();
    if (!s) {
      window.location.href = "/team/login";
      return;
    }
    if (s.role !== "admin") {
      window.location.href = "/staff";
      return;
    }
    setSessionRole(s.role);
    void fetch("/api/menu-config", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const options = Array.isArray(data?.storeConfig?.events)
          ? data.storeConfig.events
              .map((event: { id?: string; name?: string }) => ({
                id: String(event?.id || "").trim(),
                name: String(event?.name || "").trim(),
              }))
              .filter((event: { id: string; name: string }) => event.id && event.name)
          : [];
        setEventOptions(options);
        if (options.length > 0 && !cashierEventId) {
          setCashierEventId(options[0].id);
        }
      })
      .catch(() => {});
    reload();
  }, []);

  const t = UI_TEXT[lang];
  const sorted = useMemo(() => [...users].sort((a, b) => a.username.localeCompare(b.username)), [users]);

  function reload() {
    setUsers(getUsers());
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui",
        backgroundColor: "#FFF3E6",
        backgroundImage:
          "linear-gradient(180deg, rgba(255,243,230,0.82) 0%, rgba(255,243,230,0.9) 100%), url('/logo-afrofood.png')",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center, center",
        backgroundSize: "cover, min(64vw, 420px)",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            background: "white",
            border: "1px solid #F1D7C8",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 12px 30px rgba(242,140,40,0.18)",
            position: "sticky",
            top: 12,
            zIndex: 20,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
              <img
                src="/logo-afrofood.png"
                alt="AfroFood"
                style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover", border: "1px solid #F1D7C8" }}
              />
              {t.title}
            </h1>
            {sessionRole ? <div style={{ marginTop: 4 }}><span className="af-role-badge">Role: {getStaffRoleLabel(sessionRole, lang)}</span></div> : null}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {(["de", "fr", "en"] as Lang[]).map((L) => (
              <button
                key={L}
                type="button"
                onClick={() => {
                  setLang(L);
                  saveLang(L);
                }}
                className={`af-lang-btn ${lang === L ? "is-active" : ""}`}
              >
                {L.toUpperCase()}
              </button>
            ))}
            <button type="button" onClick={() => goBackOr("/staff/admin")} className="af-link-btn" style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "white", color: "#111", fontWeight: 800, cursor: "pointer" }}>
              {t.back}
            </button>
          </div>
        </div>

        <div
          style={{
            height: 6,
            borderRadius: 999,
            marginTop: 12,
            background:
              "repeating-linear-gradient(90deg, #111 0 10px, #F28C28 10px 20px, #111 20px 30px, #fff 30px 40px)",
            opacity: 0.9,
          }}
        />

	        <div style={{ marginTop: 12, background: "white", border: "1px solid #F1D7C8", borderRadius: 12, padding: 12 }}>
	          <div style={{ fontWeight: 900, fontSize: 22 }}>{t.createUser}</div>
	          {eventOptions.length > 0 ? (
	            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
	              {lang === "fr"
	                ? "Plusieurs utilisateurs caisse ou cuisine peuvent etre assignes au meme evenement."
	                : lang === "de"
	                ? "Mehrere Kassen- oder Kuchenbenutzer konnen demselben Event zugewiesen werden."
	                : "Multiple cashier or kitchen users can be assigned to the same event."}
	            </div>
	          ) : null}
	          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t.username} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }} />
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.password} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }} />
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", maxWidth: 220 }}>
              <option value="admin">{t.roleAdmin}</option>
              <option value="cashier">{t.roleCashier}</option>
              <option value="kitchen">{t.roleKitchen}</option>
            </select>
            {(role === "cashier" || role === "kitchen") && eventOptions.length > 0 ? (
              <select
                value={cashierEventId}
                onChange={(e) => setCashierEventId(e.target.value)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", maxWidth: 280 }}
              >
                {eventOptions.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            ) : null}
	                <button
	                  className="af-btn"
	                  type="button"
              onClick={() => {
                try {
                  setError(null);
                  createUser({ username, password, role, cashierEventId });
                  setUsername("");
                  setPassword("");
                  setRole("cashier");
                  if (eventOptions.length > 0) setCashierEventId(eventOptions[0].id);
                  reload();
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : t.createError);
                }
              }}
              style={{ width: "fit-content", padding: "10px 14px", borderRadius: 10, border: "none", background: "#111", color: "white", fontWeight: 800 }}
            >
              {t.create}
            </button>
            {error ? <div style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</div> : null}
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {sorted.map((u) => (
            <div key={u.id} style={{ background: "white", border: "1px solid #F1D7C8", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 22 }}>{u.username}</div>
              <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={u.role}
                  onChange={(e) => {
                    updateUser(u.id, { role: e.target.value as StaffRole });
                    reload();
                  }}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }}
                >
                  <option value="admin">{t.roleAdmin}</option>
                  <option value="cashier">{t.roleCashier}</option>
                  <option value="kitchen">{t.roleKitchen}</option>
                </select>
	                {(u.role === "cashier" || u.role === "kitchen") && eventOptions.length > 0 ? (
	                  <select
	                    value={u.cashierEventId || ""}
                    onChange={(e) => {
                      updateUser(u.id, { cashierEventId: e.target.value });
                      reload();
                    }}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    {eventOptions.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
	                    ))}
	                  </select>
	                ) : null}
	                {(u.role === "cashier" || u.role === "kitchen") && u.cashierEventId ? (
	                  <div style={{ padding: "6px 10px", borderRadius: 999, background: "#fff7ed", color: "#9a3412", fontWeight: 800 }}>
	                    {(eventOptions.find((event) => event.id === u.cashierEventId)?.name || u.cashierEventId)}
	                  </div>
	                ) : null}
	                <button
                  className="af-btn"
                  type="button"
                  onClick={() => {
                    updateUser(u.id, { active: !u.active });
                    reload();
                  }}
                  style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: u.active ? "#0f766e" : "#64748b", color: "white", fontWeight: 800 }}
                >
                  {u.active ? t.deactivate : t.activate}
                </button>
                <button
                  className="af-btn"
                  type="button"
                  onClick={() => {
                    updateUser(u.id, { password: "0603" });
                    reload();
                  }}
                  style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: "#1d4ed8", color: "white", fontWeight: 800 }}
	                >
	                  {t.resetPassword}
	                </button>
                  <input
                    type="password"
                    value={passwordDrafts[u.id] || ""}
                    onChange={(e) =>
                      setPasswordDrafts((prev) => ({
                        ...prev,
                        [u.id]: e.target.value,
                      }))
                    }
                    placeholder={t.newPasswordPlaceholder}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", minWidth: 180 }}
                  />
	                <button
	                  className="af-btn"
	                  type="button"
                    onClick={() => {
                      const nextPassword = String(passwordDrafts[u.id] || "").trim();
                      if (!nextPassword) return;
                      updateUser(u.id, { password: nextPassword });
                      setPasswordDrafts((prev) => ({
                        ...prev,
                        [u.id]: "",
                      }));
                      reload();
                    }}
	                  style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: "#7c3aed", color: "white", fontWeight: 800 }}
	                >
	                  {t.changePassword}
	                </button>
	                <button
	                  className="af-btn"
	                  type="button"
                  onClick={() => {
                    deleteUser(u.id);
                    reload();
                  }}
                  style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: "#b91c1c", color: "white", fontWeight: 800 }}
                >
                  {t.deleteUser}
                </button>
                <div style={{ padding: "6px 10px", borderRadius: 999, background: u.active ? "#dcfce7" : "#fee2e2", color: u.active ? "#166534" : "#991b1b", fontWeight: 800 }}>
                  {u.active ? t.active : t.inactive}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
