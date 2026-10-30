"use client";

import { useRef, useState } from "react";
import { staffFetch } from "@/lib/staff-auth";
import { MAX_PRODUCT_FILE_BYTES, type ProductFileKind } from "@/lib/product-files";
import type { Lang } from "@/lib/translations";

type Asset = { version: string; url: string; size: number; contentType: string };
type Files = { image: Asset | null; pdf: Asset | null; fallbackImageUrl: string };
const copy = {
  fr: { open: "Image et PDF", scope: "Fichiers communs à tous les événements du personnel.", load: "Actualiser", image: "Image", pdf: "PDF privé (administration)", remove: "Supprimer", view: "Ouvrir", busy: "En cours…", saved: "Fichier enregistré.", deleted: "Fichier supprimé.", error: "Opération non confirmée. Actualisez avant de réessayer.", conflict: "Le fichier a changé. Actualisez avant de réessayer.", size: "Choisissez un fichier de 4 Mo maximum.", cleanup: "Modification enregistrée ; nettoyage de l’ancien fichier en attente.", confirm: "Supprimer ce fichier pour tous les événements du personnel ?", formats: "JPEG, PNG, WebP ou PDF ; 4 Mo maximum." },
  de: { open: "Bild und PDF", scope: "Gemeinsame Dateien für alle Personal-Events.", load: "Aktualisieren", image: "Bild", pdf: "Privates PDF (Administration)", remove: "Löschen", view: "Öffnen", busy: "Wird bearbeitet…", saved: "Datei gespeichert.", deleted: "Datei gelöscht.", error: "Vorgang nicht bestätigt. Vor erneutem Versuch aktualisieren.", conflict: "Die Datei wurde geändert. Bitte aktualisieren.", size: "Datei mit maximal 4 MB auswählen.", cleanup: "Gespeichert; Bereinigung der alten Datei steht aus.", confirm: "Diese Datei für alle Personal-Events löschen?", formats: "JPEG, PNG, WebP oder PDF; maximal 4 MB." },
  en: { open: "Image and PDF", scope: "Shared files for all staff events.", load: "Refresh", image: "Image", pdf: "Private PDF (administration)", remove: "Delete", view: "Open", busy: "Working…", saved: "File saved.", deleted: "File deleted.", error: "Operation unconfirmed. Refresh before retrying.", conflict: "The file changed. Refresh before retrying.", size: "Choose a file of up to 4 MB.", cleanup: "Saved; old file cleanup pending.", confirm: "Delete this file for all staff events?", formats: "JPEG, PNG, WebP or PDF; up to 4 MB." },
};

export function ProductFilesEditor({ productId, lang, onImageChange }: {
  productId: string; lang: Lang; onImageChange: (url: string) => void;
}) {
  const [files, setFiles] = useState<Files | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  const ui = copy[lang];

  async function refresh() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage("");
    try {
      const res = await staffFetch(`/api/admin/product-files?productId=${encodeURIComponent(productId)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error();
      setFiles(body);
      onImageChange(body.image?.url ?? body.fallbackImageUrl);
    } catch { setFiles(null); setMessage(ui.error); }
    finally { locked.current = false; setBusy(false); }
  }

  async function change(kind: ProductFileKind, file?: File) {
    if (!files || locked.current) return;
    if (file && (!file.size || file.size > MAX_PRODUCT_FILE_BYTES)) { setMessage(ui.size); return; }
    if (!file && !window.confirm(ui.confirm)) return;
    locked.current = true; setBusy(true); setMessage("");
    try {
      let init: RequestInit;
      const expectedVersion = files[kind]?.version ?? null;
      if (file) {
        const form = new FormData();
        form.set("productId", productId); form.set("kind", kind); form.set("expectedVersion", expectedVersion ?? ""); form.set("file", file);
        init = { method: "POST", body: form };
      } else {
        init = { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, kind, expectedVersion }) };
      }
      const res = await staffFetch("/api/admin/product-files", init);
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setFiles(null); setMessage(res.status === 409 ? ui.conflict : ui.error); return;
      }
      setFiles({ ...files, [kind]: body.asset });
      if (kind === "image") onImageChange(body.asset?.url ?? files.fallbackImageUrl);
      setMessage(body.cleanupPending ? ui.cleanup : file ? ui.saved : ui.deleted);
    } catch { setFiles(null); setMessage(ui.error); }
    finally { locked.current = false; setBusy(false); }
  }

  return <details onToggle={event => { if (event.currentTarget.open && !files && !locked.current) void refresh(); }}>
    <summary>{ui.open}</summary>
    <p>{ui.scope}</p><p>{ui.formats}</p>
    <button type="button" disabled={busy} onClick={refresh}>{busy ? ui.busy : ui.load}</button>
    {(["image", "pdf"] as const).map(kind => <fieldset key={kind} disabled={busy || !files}>
      <legend>{ui[kind]}</legend>
      <input aria-label={ui[kind]} type="file" accept={kind === "image" ? ".jpg,.jpeg,.png,.webp" : ".pdf"}
        onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void change(kind, file); }} />
      {files?.[kind] ? <>
        <a href={files[kind].url} target="_blank" rel="noopener noreferrer">{ui.view}</a>
        <button type="button" onClick={() => change(kind)}>{ui.remove}</button>
      </> : null}
    </fieldset>)}
    <p role="status" aria-live="polite">{message}</p>
  </details>;
}
