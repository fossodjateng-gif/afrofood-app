"use client";

import { AssignedCashierGate } from "@/components/AssignedCashierGate";
import { StaffPageFrame } from "@/components/StaffPageFrame";
import cuisine from "@/components/cuisine.module.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OrderReceipt, type ReceiptLabels } from "@/components/OrderReceipt";
import { CardPayment } from "@/components/pos/CardPayment";
import { cardAttemptKey, cancelPosCard, checkPosCard, isCanceledCardOrder, isPaidCardOrder, makeCardFingerprint, preparePosCard, type CardAttempt } from "@/lib/pos-card";
import type { OrderRow } from "@/lib/schema";
import { CashPayment } from "@/components/pos/CashPayment";
import { cashAttemptKey, confirmPosCash, parseReceivedCents, type CashAttempt, type CashReceipt } from "@/lib/pos-cash";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { PosCart } from "@/components/pos/PosCart";
import { getStaffRoleLabel } from "@/lib/staff-auth";
import { getCashierSession as getSession, cashierFetch, type CashierSession as StaffSession } from "@/lib/temporary-cashier-client";
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

function ManualCaissePage() {
  const [cardAttempt, setCardAttempt] = useState<CardAttempt | null>(null);
  const [cardOrder, setCardOrder] = useState<OrderRow | null>(null);
  const [cardReceipt, setCardReceipt] = useState<OrderRow | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardDelayed, setCardDelayed] = useState(false);
  const cardRef = useRef<CardAttempt | null>(null);
  const cardBusyRef = useRef(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [paymentHidden, setPaymentHidden] = useState(false);
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
      const eventId = session.cashierEventId || "";
      if (!session.workstationId || session.workstationType !== "cashier") throw new Error("workstation_assignment_required");
      if (!eventId || !session.userId) throw new Error("Kein Event zugewiesen. Bitte die Event-Zuweisung des Kassenkontos oder die Event-Auswahl der Kasse prüfen.");
      const response = await cashierFetch(`/api/admin/menu-config?eventId=${encodeURIComponent(eventId)}`, {
        headers: { "x-staff-role": session.role }, cache: "no-store", signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Das Event-Menü konnte nicht geladen werden.");
      const event = (data.storeConfig?.events as Array<{ id: string; name: string }> | undefined)?.find((entry) => entry.id === eventId);
      if (!event?.name || !Array.isArray(data.sections)) throw new Error("Das zugewiesene Event ist nicht verfügbar. Es wurde kein anderes Event ausgewählt.");
      if (controller.signal.aborted) return;
      const latestSession = getSession();
      const latestEventId = latestSession?.cashierEventId || "";
      if (latestSession?.userId !== session.userId || latestSession.role !== session.role || latestEventId !== eventId || latestSession.workstationId !== session.workstationId || latestSession.temporaryContextId !== session.temporaryContextId) {
        throw new Error("Der Kassenkontext wurde geändert. Bitte das Menü aktualisieren.");
      }
      const sections = (data.sections as PosSection[]).map((section) => ({ ...section, items: section.items.filter((product) => product.visible) })).filter((section) => section.items.length > 0);
      const cartKey = posCartKey(session.userId, eventId, session.workstationId);
      const products = new Map(sections.flatMap((section) => section.items.map((product) => [product.id, product] as const)));
      const storedCard = localStorage.getItem(cardAttemptKey(cartKey));
      const storedAttempt = localStorage.getItem(cashAttemptKey(cartKey));
      if (session.temporaryContextId && storedCard) throw new Error("Une tentative carte existe sur cette caisse. Vérifiez-la dans son parcours habituel.");
      if (storedCard && storedAttempt) throw new Error("Zwei gespeicherte Zahlungen: bitte zuerst den Zahlungsstatus prüfen.");
      if (storedCard) {
        const saved = JSON.parse(storedCard) as CardAttempt;
        if (saved.eventId !== eventId || saved.userId !== session.userId || saved.workstationId !== session.workstationId || saved.username !== session.username?.trim().toLowerCase() || !saved.key || !saved.fingerprint || !Array.isArray(saved.items)) throw new Error("Die gespeicherte Kartenzahlung muss geprüft werden.");
        if (cardRef.current?.key !== saved.key) {
          setCardOrder(null);
          setCardReceipt(null);
          setShowReceipt(false);
        }
        cardRef.current = saved;
        setCardAttempt(saved);
      } else if (!cardBusyRef.current) {
        if (cardRef.current) setShowReceipt(false);
        cardRef.current = null;
        setCardAttempt(null);
        setCardReceipt(null);
      }
      if (storedAttempt) {
        const saved = JSON.parse(storedAttempt) as CashAttempt;
        if (saved.eventId !== eventId || saved.userId !== session.userId || saved.workstationId !== session.workstationId || !saved.key || !Array.isArray(saved.items)) throw new Error("Die gespeicherte Zahlung muss geprüft werden.");
        attemptRef.current = saved;
        setCashAttempt(saved);
        setCashOpen(true);
      }
      const restored = storedCard && cardRef.current ? cardRef.current.items : storedAttempt && attemptRef.current ? attemptRef.current.items : reconcilePosCart(readPosCart(cartKey), products);
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
      if (!event.key || event.key === CAISSE_EVENT_ID_KEY || event.key === "af_staff_users_v1" || event.key === "af_staff_session_v1" || event.key === current?.cartKey || event.key === (current && cardAttemptKey(current.cartKey)) || event.key === (current && cashAttemptKey(current.cartKey))) void loadContext();
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
    if (!current || cashOpen || attemptRef.current || cashBusyRef.current || cardRef.current || cardBusyRef.current) return;
    const session = getSession();
    let eventId: string;
    try {
      eventId = session?.cashierEventId || "";
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
    localStorage.setItem(cashAttemptKey(posCartKey(attempt.userId, attempt.eventId, attempt.workstationId)), JSON.stringify(attempt));
    attemptRef.current = attempt;
    setCashAttempt({ ...attempt });
  }

  async function confirmCash() {
    if (cashBusyRef.current || cashReceipt || cardRef.current || cardBusyRef.current) return;
    const current = contextRef.current;
    const cents = parseReceivedCents(received);
    if (!current || cents === null) return;
    cashBusyRef.current = true;
    setCashBusy(true);
    setCashError(null);
    try {
      const session = getSession();
      const eventId = session?.cashierEventId;
      if (session?.userId !== current.session.userId || session.role !== current.session.role || eventId !== current.eventId || session?.workstationId !== current.session.workstationId || (attemptRef.current && (attemptRef.current.userId !== session.userId || attemptRef.current.role !== session.role || attemptRef.current.eventId !== eventId))) throw new Error("Der Kassenkontext wurde geändert. Bitte die ursprüngliche Zahlung in der richtigen Kasse fortsetzen.");
      let attempt = attemptRef.current;
      if (!attempt) {
        if (!itemsRef.current.length || itemsRef.current.some((item) => !products.get(item.id) || item.qty > getProductLimit(products.get(item.id)!))) throw new Error("Bitte die verfügbaren Artikel prüfen.");
        attempt = { key: crypto.randomUUID(), userId: session.userId, workstationId: session.workstationId, role: session.role, eventId: current.eventId, eventName: current.eventName, items: itemsRef.current.map((item) => ({ ...item })), amountCents: getPosBreakdown(itemsRef.current).totalCents };
        if (cents < attempt.amountCents) throw new Error("Der erhaltene Betrag ist zu niedrig.");
        persistAttempt(attempt);
      }
      const receipt = await confirmPosCash(attempt, cents, persistAttempt, cashierFetch);
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
        if (attempt) localStorage.removeItem(cashAttemptKey(posCartKey(attempt.userId, attempt.eventId, attempt.workstationId)));
        attemptRef.current = null;
        setCashAttempt(null);
      }
    } finally {
      cashBusyRef.current = false;
      setCashBusy(false);
    }
  }

  function requireCardContext() {
    const current = contextRef.current;
    const session = getSession();
    const eventId = session?.cashierEventId;
    const attempt = cardRef.current;
    if (!current || !session || session.userId !== current.session.userId || session.role !== current.session.role || eventId !== current.eventId || session?.workstationId !== current.session.workstationId || (attempt && (attempt.userId !== session.userId || attempt.eventId !== eventId || attempt.username !== session.username?.trim().toLowerCase()))) throw new Error("Der Kassenkontext wurde geändert. Dieselbe Zahlung im ursprünglichen Kontext prüfen.");
    return current;
  }

  function persistCard(attempt: CardAttempt) {
    localStorage.setItem(cardAttemptKey(posCartKey(attempt.userId, attempt.eventId, attempt.workstationId)), JSON.stringify(attempt));
    const current = contextRef.current;
    if (!current || current.eventId !== attempt.eventId || current.session.userId !== attempt.userId || current.session.workstationId !== attempt.workstationId) return;
    cardRef.current = attempt;
    setCardAttempt({ ...attempt });
  }

  const verifyCard = useCallback(async () => {
    const attempt = cardRef.current;
    if (!attempt?.orderId || cardBusyRef.current) return;
    try {
      requireCardContext();
      const row = await checkPosCard(attempt);
      requireCardContext();
      if (cardRef.current?.key !== attempt.key) return;
      setCardOrder(row);
      if (row && ["cancel_requested", "canceled"].includes(row.pos_card_state || "") && !attempt.cancelRequested) {
        attempt.cancelRequested = true;persistCard(attempt);
      }
      if (row && isPaidCardOrder(row, attempt)) {
        setCardReceipt(row);
        setCardError(null);
      } else if (isCanceledCardOrder(row, attempt)) {
        setCardError(null);
      } else if (row?.status !== "PENDING_PAYMENT") {
        setCardError("Diese Bestellung muss geprüft werden. Bitte nicht erneut bezahlen.");
      }
      setCardDelayed(Date.now() - attempt.createdAt > 30000);
    } catch (reason) {
      if (cardRef.current?.key === attempt.key) setCardError(reason instanceof Error ? reason.message : "Zahlungsstatus unklar. Bitte nicht erneut bezahlen.");
    }
  }, []);

  async function resumeCard() {
    if (cardBusyRef.current || cashBusyRef.current || attemptRef.current || cashOpen) return;
    cardBusyRef.current = true;
    setCardBusy(true);
    setCardError(null);
    try {
      requireCardContext();
      const attempt = cardRef.current;
      if (!attempt) return;
      if (attempt.cancelRequested) { setCardOrder(await checkPosCard(attempt)); return; }
      const row = await preparePosCard(attempt, persistCard);
      requireCardContext();
      setCardOrder(row);
      if (row && isPaidCardOrder(row, attempt)) setCardReceipt(row);
    } catch (reason) {
      setCardError(reason instanceof Error ? reason.message : "Kartenzahlung unklar. Dieselbe Zahlung prüfen.");
    } finally {
      cardBusyRef.current = false;
      setCardBusy(false);
    }
  }

  async function startCard() {
    if (getSession()?.temporaryContextId) return;
    if (cardBusyRef.current || cashOpen || cashBusyRef.current || attemptRef.current || cardRef.current) return;
    cardBusyRef.current = true;
    setCardBusy(true);
    setCardError(null);
    try {
      const current = requireCardContext();
      if (!current.session.username?.trim() || !itemsRef.current.length || storageError || itemsRef.current.some((item) => !products.get(item.id) || item.qty > getProductLimit(products.get(item.id)!))) throw new Error("Bitte den Kassenbenutzer und die verfügbaren Artikel prüfen.");
      if (!navigator.locks) throw new Error("Dieser Browser unterstützt keine sichere Zahlungskoordination. Bitte einen aktuellen Browser verwenden.");
      // Coordinate creation of the local attempt across tabs before any request.
      await navigator.locks.request(`${current.cartKey}:payment`, async () => {
        requireCardContext();
        if (localStorage.getItem(cashAttemptKey(current.cartKey))) throw new Error("Eine Barzahlung ist noch offen.");
        const stored = localStorage.getItem(cardAttemptKey(current.cartKey));
        let attempt: CardAttempt;
        if (stored) {
          attempt = JSON.parse(stored) as CardAttempt;
          if (attempt.userId !== current.session.userId || attempt.eventId !== current.eventId || attempt.workstationId !== current.session.workstationId || attempt.username !== current.session.username?.trim().toLowerCase()) throw new Error("Gespeicherte Zahlung gehört zu einem anderen Kassenkontext.");
        } else {
          attempt = { key: crypto.randomUUID(), fingerprint: "", userId: current.session.userId, workstationId: current.session.workstationId, username: current.session.username!.trim().toLowerCase(), role: current.session.role, eventId: current.eventId, eventName: current.eventName, items: itemsRef.current.map((item) => ({ ...item })), amountCents: getPosBreakdown(itemsRef.current).totalCents, createdAt: Date.now() };
          attempt.fingerprint = await makeCardFingerprint(attempt);
        }
        persistCard(attempt);
      });
      setShowReceipt(false);
      setCardReceipt(null);
    } catch (reason) {
      setCardError(reason instanceof Error ? reason.message : "Kartenzahlung konnte nicht vorbereitet werden.");
    } finally {
      cardBusyRef.current = false;
      setCardBusy(false);
    }
    if (cardRef.current) await resumeCard();
  }

  useEffect(() => {
    if (!cardAttempt || !context || cardAttempt.eventId !== context.eventId || cardAttempt.userId !== context.session.userId) return;
    if (!cardAttempt.published && !cardAttempt.cancelRequested) void resumeCard();
    void verifyCard();
    const interval = window.setInterval(() => void verifyCard(), 2500);
    return () => window.clearInterval(interval);
    // Reconnect only on attempt/context changes; callbacks read the current refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardAttempt?.key, context?.eventId, context?.session.userId, verifyCard]);

  async function cancelCard() {
    if (cardBusyRef.current || cashBusyRef.current) return;
    cardBusyRef.current = true;setCardBusy(true);setCardError(null);
    try {
      requireCardContext();
      const attempt = cardRef.current;
      if (!attempt) return;
      const result = await cancelPosCard(attempt, persistCard);
      requireCardContext();
      if (cardRef.current?.key !== attempt.key) return;
      setCardOrder(result.order);
      if (isPaidCardOrder(result.order, attempt)) setCardReceipt(result.order);
      if (result.outcome === "requires_review") setCardError("Stornierung muss gepr?ft werden. Keine neue Zahlung starten.");
    } catch (reason) {
      setCardError(reason instanceof Error ? reason.message : "Stornierung unklar. Erneut pr?fen.");
    } finally {
      cardBusyRef.current = false;setCardBusy(false);
    }
  }

  function newCardOrder() {
    try {
      const current = requireCardContext();
      const attempt = cardRef.current;
      if (!attempt || !((cardReceipt && isPaidCardOrder(cardReceipt, attempt)) || isCanceledCardOrder(cardOrder, attempt))) return;
      if (!writePosCart(current.cartKey, [])) throw new Error("Warenkorb konnte nicht geleert werden. Dieselbe Zahlung behalten.");
      localStorage.removeItem(cardAttemptKey(current.cartKey));
      cardRef.current = null;
      setCardAttempt(null);
      setCardOrder(null);
      setCardReceipt(null);
      setCardError(null);
      setCardDelayed(false);
      setShowReceipt(false);
      itemsRef.current = [];
      setItems([]);
      void loadContext();
    } catch (reason) {
      setCardError(reason instanceof Error ? reason.message : "Zahlung gespeichert. Bitte erneut prüfen.");
    }
  }

  const labels = {
    de: { refresh: "Menü aktualisieren", back: "Zurück / Kassenbereich", event: "Zugewiesenes Event", user: "Angemeldet als", loading: "Wird geladen…", noEvent: "Kein Event geladen", preview: "Barzahlung / Kartenzahlung", title: "Manuelle Kasse", unavailable: "Manuelle Kasse nicht verfügbar", contextError: "Bitte Konto und Event prüfen und das Menü erneut laden.", storageError: "Der Warenkorb kann auf diesem Gerät nicht gespeichert werden. Beim Neuladen kann er verloren gehen." },
    fr: { refresh: "Actualiser le menu", back: "Retour / Espace Caisse", event: "Événement affecté", user: "Connecté en tant que", loading: "Chargement…", noEvent: "Aucun événement chargé", preview: "Espèces / Carte", title: "Caisse manuelle", unavailable: "Caisse manuelle indisponible", contextError: "Vérifiez le compte et l’événement, puis rechargez le menu.", storageError: "Le panier ne peut pas être enregistré sur cet appareil. Il peut être perdu au rechargement." },
    en: { refresh: "Refresh menu", back: "Back / Cashier space", event: "Assigned event", user: "Logged in as", loading: "Loading…", noEvent: "No event loaded", preview: "Cash / Card", title: "Manual cashier", unavailable: "Manual cashier unavailable", contextError: "Check the account and event, then reload the menu.", storageError: "The cart cannot be saved on this device. Reloading may lose it." },
  }[lang];

  const hasPayment = cashOpen || !!cardAttempt || cardBusy;
  const paymentVisible = hasPayment && !paymentHidden;
  const manualBack = lang === "fr" ? "Retour / Caisse manuelle" : lang === "de" ? "Zurück / Manuelle Kasse" : "Back / Manual cashier";
  const resumePayment = lang === "fr" ? "Reprendre le paiement" : lang === "de" ? "Zahlung fortsetzen" : "Resume payment";

  return (
    <div className={cuisine.workspace}>
      <StaffPageFrame title={labels.title} lang={lang} wide compactContext
        context={{ name: context?.session.username || "", role: context ? getStaffRoleLabel(context.session.role, lang) : "",
          eventName: context?.eventName || (loading ? labels.loading : labels.noEvent) }}
        back={paymentVisible
          ? <button className="af-link-btn" type="button" onClick={() => setPaymentHidden(true)}>{manualBack}</button>
          : <a className="af-link-btn" href="/staff/caisse">{labels.back}</a>}
        onLangChange={language => { setLang(language); saveLang(language); }}
        actions={<button className="af-link-btn" type="button" onClick={() => void loadContext()} disabled={loading || cashBusy || !!cashAttempt || cardBusy || !!cardAttempt}>{labels.refresh}</button>}
      >
        <p><span className="af-role-badge">{labels.preview}</span></p>
        {error ? <div className={styles.error} role="alert"><strong>{labels.unavailable}</strong><p>{labels.contextError}</p><a className="af-link-btn" href="/staff/caisse">{labels.back}</a></div> : null}
        {storageError && context ? <div className={styles.error} role="alert">{labels.storageError}</div> : null}
        {loading ? <div className={styles.loading} role="status">{labels.loading}</div> : null}
        {paymentVisible && (cardAttempt || cardBusy) ? <CardPayment lang={lang} order={cardOrder} onCancel={() => void cancelCard()} attempt={cardAttempt} receipt={cardReceipt} busy={cardBusy} error={cardError} delayed={cardDelayed} onCheck={() => void verifyCard()} onResume={() => void resumeCard()} onNew={newCardOrder} onTicket={() => { setShowReceipt(true); }} /> : null}
        {!cardAttempt && !cardBusy && cardError ? <p role="alert" className={styles.error}>{cardError}</p> : null}
        {paymentVisible && cashOpen ? <CashPayment lang={lang} totalCents={cashAttempt?.amountCents ?? getPosBreakdown(items).totalCents} received={received} busy={cashBusy} error={cashError} receipt={cashReceipt} locked={!!cashAttempt} onReceived={setReceived} onConfirm={() => void confirmCash()} onClose={() => setCashOpen(false)} onTicket={() => { setShowReceipt(true); }} onNew={() => { setShowReceipt(false); setCashReceipt(null); setCashOpen(false); setReceived(""); setCashError(null); }} /> : null}
        {paymentVisible && (cardReceipt || cashReceipt) && showReceipt ? <OrderReceipt order={(cardReceipt || cashReceipt)!} lang={lang} labels={receiptLabels[lang]} showEvent onPrint={() => window.print()} /> : null}
        {paymentHidden && hasPayment ? <button className="af-btn" type="button" onClick={() => setPaymentHidden(false)}>{resumePayment}</button> : null}
        {context && !loading && !paymentVisible ? <div className={styles.workspace}>
          <ProductGrid lang={lang} sections={context.sections} categoryId={categoryId} quantities={quantities} onCategoryChange={setCategoryId} onAdd={addProduct} />
          <PosCart onCard={() => void startCard()} cardDisabled={hasPayment || !!context.session.temporaryContextId || items.length === 0 || storageError || cardBusy || !!cardAttempt || items.some((item) => !products.get(item.id) || item.qty > getProductLimit(products.get(item.id)!))} onCash={() => { if (cardRef.current || cardBusyRef.current || localStorage.getItem(cardAttemptKey(context.cartKey))) { void loadContext(); return; } setCashOpen(true); setCashError(null); setReceived(""); }} cashDisabled={hasPayment || items.length === 0 || storageError || items.some((item) => !products.get(item.id) || item.qty > getProductLimit(products.get(item.id)!))} lang={lang} items={items} products={products} onIncrease={addProduct} onDecrease={(id) => updateCart((current) => decreasePosProduct(current, id))} onRemove={(id) => updateCart((current) => current.filter((item) => item.id !== id))} />
        </div> : null}

      </StaffPageFrame>
    </div>
  );
}

export default function AssignedManualCaissePage() { return <AssignedCashierGate><ManualCaissePage /></AssignedCashierGate>; }
