"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OrderReceipt, type ReceiptLabels } from "@/components/OrderReceipt";
import { CashPayment } from "@/components/pos/CashPayment";
import { cashAttemptKey, confirmPosCash, parseReceivedCents, type CashAttempt, type CashReceipt } from "@/lib/pos-cash";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { PosCart } from "@/components/pos/PosCart";
import { getSession, getStaffRoleLabel, resolveCashierEventId, type StaffSession } from "@/lib/staff-auth";
import { getSavedLang, saveLang, type Lang } from "@/lib/translations";
import { addPosProduct, decreasePosProduct, getPosBreakdown, getProductLimit, posCartKey, readPosCart, reconcilePosCart, writePosCart, type PosCartItem, type PosProduct, type PosSection } from "@/lib/pos-cart";
import styles from "@/components/pos/pos.module.css";

const receiptLabels: Record<Lang, ReceiptLabels> = {
  de: { ticketTitle: "Kundenbeleg", ticketSub: "Ausgestellt nach Zahlungsfreigabe", order: "Bestellung", name: "Name", payment: "Zahlung", total: "Gesamt", ticketLegend: "(1) Enthalt Gluten - (2) Enthalt Sellerie", ticketSent: "Bestellung an die Kuche gesendet", thanks: "Vielen Dank!", reprint: "Beleg drucken" },
  fr: { ticketTitle: "Ticket Client", ticketSub: "Emis apres validation paiement", order: "Commande", name: "Nom", payment: "Paiement", total: "Total", ticketLegend: "(1) Contient gluten - (2) Contient celeri", ticketSent: "Commande envoyee en cuisine", thanks: "Merci!", reprint: "Imprimer ticket" },
  en: { ticketTitle: "Customer ticket", ticketSub: "Issued after payment validation", order: "Order", name: "Name", payment: "Payment", total: "Total", ticketLegend: "(1) Contains gluten - (2) Contains celery", ticketSent: "Order sent to kitchen", thanks: "Thank you!", reprint: "Print receipt" },
};

const CAISSE_EVENT_ID_KEY = "af_caisse_event_id";

type PosContext = {
  session: StaffSession;
  eventId: string;
  eventName: string;
  cartKey: string;
  sections: PosSection[];
};

export default function ManualCaissePage() {
  const [showReceipt, setShowReceipt] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [cashAttempt, setCashAttempt] = useState<CashAttempt | null>(null);
  const [cashReceipt, setCashReceipt] = useState<CashReceipt | null>(null);
  const [received, setReceived] = useState("");
  const [cashBusy, setCashBusy] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const attemptRef = useRef<CashAttempt | null>(null);
  const cashBusyRef = useRef(false);
  const [lang, setLang] = useState<Lang>("de");
  const [context, setContext] = useState<PosContext | null>(null);
  const [items, setItems] = useState<PosCartItem[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const contextRef = useRef<PosContext | null>(null);
  const itemsRef = useRef<PosCartItem[]>([]);

  const loadContext = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    // Hide the old event while resolving the exact staff context.
    contextRef.current = null;
    setContext(null);
    try {
      const session = getSession();
      if (!session) { window.location.href = "/team/login"; return; }
      if (session.role !== "admin" && session.role !== "cashier") { window.location.href = "/staff"; return; }
      const eventId = session.role === "cashier"
        ? resolveCashierEventId(session)
        : String(localStorage.getItem(CAISSE_EVENT_ID_KEY) || "").trim();
      if (!eventId || !session.userId) throw new Error("Kein Event zugewiesen. Bitte die Event-Zuweisung des Kassenkontos oder die Event-Auswahl der Kasse prüfen.");
      const response = await fetch(`/api/admin/menu-config?eventId=${encodeURIComponent(eventId)}`, {
        headers: { "x-staff-role": session.role }, cache: "no-store", signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Das Event-Menü konnte nicht geladen werden.");
      const event = (data.storeConfig?.events as Array<{ id: string; name: string }> | undefined)?.find((entry) => entry.id === eventId);
      if (!event?.name || !Array.isArray(data.sections)) throw new Error("Das zugewiesene Event ist nicht verfügbar. Es wurde kein anderes Event ausgewählt.");
      if (controller.signal.aborted) return;
      const latestSession = getSession();
      const latestEventId = latestSession?.role === "cashier"
        ? resolveCashierEventId(latestSession)
        : String(localStorage.getItem(CAISSE_EVENT_ID_KEY) || "").trim();
      if (latestSession?.userId !== session.userId || latestSession.role !== session.role || latestEventId !== eventId) {
        throw new Error("Der Kassenkontext wurde geändert. Bitte das Menü aktualisieren.");
      }
      const sections = (data.sections as PosSection[]).map((section) => ({ ...section, items: section.items.filter((product) => product.visible) })).filter((section) => section.items.length > 0);
      const cartKey = posCartKey(session.userId, eventId);
      const products = new Map(sections.flatMap((section) => section.items.map((product) => [product.id, product] as const)));
      const storedAttempt = localStorage.getItem(cashAttemptKey(cartKey));
      if (storedAttempt) {
        const saved = JSON.parse(storedAttempt) as CashAttempt;
        if (saved.eventId !== eventId || saved.userId !== session.userId || !saved.key || !Array.isArray(saved.items)) throw new Error("Die gespeicherte Zahlung muss geprüft werden.");
        attemptRef.current = saved;
        setCashAttempt(saved);
        setCashOpen(true);
      }
      const restored = storedAttempt && attemptRef.current ? attemptRef.current.items : reconcilePosCart(readPosCart(cartKey), products);
      const next = { session, eventId, eventName: event.name, cartKey, sections };
      contextRef.current = next;
      itemsRef.current = restored;
      setItems(restored);
      setCategoryId("");
      setContext(next);
      setStorageError(!writePosCart(cartKey, restored));
    } catch (reason: unknown) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Das Event-Menü konnte nicht geladen werden.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Restore only presentation preferences; leave checkout/context logic unchanged.
    const restoreLanguage = () => setLang(getSavedLang());
    queueMicrotask(restoreLanguage);
    void loadContext();
    const onFocus = () => { void loadContext(); };
    const onStorage = (event: StorageEvent) => {
      const current = contextRef.current;
      if (!event.key || event.key === CAISSE_EVENT_ID_KEY || event.key === "af_staff_users_v1" || event.key === "af_staff_session_v1" || event.key === current?.cartKey) void loadContext();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      requestRef.current?.abort();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [loadContext]);

  const products = useMemo(() => new Map(context?.sections.flatMap((section) => section.items.map((product) => [product.id, product] as const)) || []), [context]);
  const quantities = useMemo(() => new Map(items.map((item) => [item.id, item.qty])), [items]);

  function updateCart(update: (current: PosCartItem[]) => PosCartItem[]) {
    const current = contextRef.current;
    if (!current || cashOpen || attemptRef.current || cashBusyRef.current) return;
    const session = getSession();
    let eventId: string;
    try {
      eventId = session?.role === "cashier" ? resolveCashierEventId(session) : String(localStorage.getItem(CAISSE_EVENT_ID_KEY) || "").trim();
    } catch {
      void loadContext();
      return;
    }
    if (session?.userId !== current.session.userId || session.role !== current.session.role || eventId !== current.eventId) {
      void loadContext();
      return;
    }
    const next = update(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
    setStorageError(!writePosCart(current.cartKey, next));
  }

  function addProduct(product: PosProduct) {
    const resolved = products.get(product.id);
    if (resolved) updateCart((current) => addPosProduct(current, resolved));
  }


  function persistAttempt(attempt: CashAttempt) {
    localStorage.setItem(cashAttemptKey(posCartKey(attempt.userId, attempt.eventId)), JSON.stringify(attempt));
    attemptRef.current = attempt;
    setCashAttempt({ ...attempt });
  }

  async function confirmCash() {
    if (cashBusyRef.current || cashReceipt) return;
    const current = contextRef.current;
    const cents = parseReceivedCents(received);
    if (!current || cents === null) return;
    cashBusyRef.current = true;
    setCashBusy(true);
    setCashError(null);
    try {
      const session = getSession();
      const eventId = session?.role === "cashier" ? resolveCashierEventId(session) : localStorage.getItem(CAISSE_EVENT_ID_KEY);
      if (session?.userId !== current.session.userId || session.role !== current.session.role || eventId !== current.eventId || (attemptRef.current && (attemptRef.current.userId !== session.userId || attemptRef.current.role !== session.role || attemptRef.current.eventId !== eventId))) throw new Error("Der Kassenkontext wurde geändert. Bitte die ursprüngliche Zahlung in der richtigen Kasse fortsetzen.");
      let attempt = attemptRef.current;
      if (!attempt) {
        if (!itemsRef.current.length || itemsRef.current.some((item) => !products.get(item.id) || item.qty > getProductLimit(products.get(item.id)!))) throw new Error("Bitte die verfügbaren Artikel prüfen.");
        attempt = { key: crypto.randomUUID(), userId: session.userId, role: session.role, eventId: current.eventId, eventName: current.eventName, items: itemsRef.current.map((item) => ({ ...item })), amountCents: getPosBreakdown(itemsRef.current).totalCents };
        if (cents < attempt.amountCents) throw new Error("Der erhaltene Betrag ist zu niedrig.");
        persistAttempt(attempt);
      }
      const receipt = await confirmPosCash(attempt, cents, persistAttempt);
      if (!writePosCart(current.cartKey, [])) throw new Error("Zahlung bestätigt, aber der Warenkorb konnte nicht geleert werden. Dieselbe Zahlung erneut prüfen.");
      localStorage.removeItem(cashAttemptKey(current.cartKey));
      attemptRef.current = null;
      setCashAttempt(null);
      itemsRef.current = [];
      setItems([]);
      setShowReceipt(false);
      setCashReceipt(receipt);
      void loadContext();
    } catch (reason) {
      setCashError(reason instanceof Error ? reason.message : "Die Barzahlung konnte nicht bestätigt werden.");
      if (reason && typeof reason === "object" && "retryable" in reason && reason.retryable === true) {
        const attempt = attemptRef.current;
        if (attempt) localStorage.removeItem(cashAttemptKey(posCartKey(attempt.userId, attempt.eventId)));
        attemptRef.current = null;
        setCashAttempt(null);
      }
    } finally {
      cashBusyRef.current = false;
      setCashBusy(false);
    }
  }

  const labels = {
    de: { refresh: "Menü aktualisieren", back: "Zurück zur Kasse", event: "Zugewiesenes Event", user: "Angemeldet als", loading: "Wird geladen…", noEvent: "Kein Event geladen", preview: "Barzahlung verfügbar" },
    fr: { refresh: "Actualiser le menu", back: "Retour à la caisse", event: "Événement affecté", user: "Connecté en tant que", loading: "Chargement…", noEvent: "Aucun événement chargé", preview: "Paiement en espèces disponible" },
    en: { refresh: "Refresh menu", back: "Back to cashier", event: "Assigned event", user: "Logged in as", loading: "Loading…", noEvent: "No event loaded", preview: "Cash payment available" },
  }[lang];

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.brand}><Image src="/logo-afrofood.png" alt="AfroFood" width={30} height={30} unoptimized className={styles.logo} />Manuelle Kasse</h1>
          <div className={styles.headerActions}>
            <div className={styles.languages} role="group" aria-label="DE / FR / EN">
              {(["de", "fr", "en"] as Lang[]).map((language) => <button key={language} type="button" aria-pressed={lang === language} className={`af-lang-btn ${lang === language ? "is-active" : ""}`} onClick={() => { setLang(language); saveLang(language); }}>{language.toUpperCase()}</button>)}
            </div>
            <button className="af-link-btn" type="button" onClick={() => void loadContext()} disabled={loading || cashBusy || !!cashAttempt}>{labels.refresh}</button>
            <Link className="af-link-btn" href="/caisse">← {labels.back}</Link>
          </div>
        </header>
        <div className={styles.separator} aria-hidden="true" />
        <div className={styles.contextBar}>
          <div><span className={styles.contextLabel}>{labels.event}</span><strong>{context?.eventName || (loading ? labels.loading : labels.noEvent)}</strong></div>
          {context ? <div><span className={styles.contextLabel}>{labels.user}</span><strong>{context.session.username || "Kasse"} <span className="af-role-badge">{getStaffRoleLabel(context.session.role, lang)}</span></strong></div> : null}
          <span className="af-role-badge">{labels.preview}</span>
        </div>
        {error ? <div className={styles.error} role="alert"><strong>Manuelle Kasse nicht verfügbar</strong><p>{error}</p><Link href="/caisse">Zur Kasse zurückkehren</Link></div> : null}
        {storageError && context ? <div className={styles.error} role="alert">Der Warenkorb kann auf diesem Gerät nicht gespeichert werden. Beim Neuladen kann er verloren gehen.</div> : null}
        {loading ? <div className={styles.loading} role="status">Event-Menü und Warenkorb werden geladen…</div> : null}
        {cashOpen ? <CashPayment lang={lang} totalCents={cashAttempt?.amountCents ?? getPosBreakdown(items).totalCents} received={received} busy={cashBusy} error={cashError} receipt={cashReceipt} locked={!!cashAttempt} onReceived={setReceived} onConfirm={() => void confirmCash()} onClose={() => setCashOpen(false)} onTicket={() => setShowReceipt(true)} onNew={() => { setShowReceipt(false); setCashReceipt(null); setCashOpen(false); setReceived(""); setCashError(null); }} /> : null}
        {cashReceipt && showReceipt ? <OrderReceipt order={cashReceipt} lang={lang} labels={receiptLabels[lang]} showEvent onPrint={() => window.print()} /> : null}
        {context && !loading && !cashOpen ? <div className={styles.workspace}>
          <ProductGrid lang={lang} sections={context.sections} categoryId={categoryId} quantities={quantities} onCategoryChange={setCategoryId} onAdd={addProduct} />
          <PosCart onCash={() => { setCashOpen(true); setCashError(null); setReceived(""); }} cashDisabled={items.length === 0 || storageError || items.some((item) => !products.get(item.id) || item.qty > getProductLimit(products.get(item.id)!))} lang={lang} items={items} products={products} onIncrease={addProduct} onDecrease={(id) => updateCart((current) => decreasePosProduct(current, id))} onRemove={(id) => updateCart((current) => current.filter((item) => item.id !== id))} />
        </div> : null}
      </div>
    </main>
  );
}
