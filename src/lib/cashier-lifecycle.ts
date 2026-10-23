"use client";
import { refreshStaffSession, type StaffSession } from "@/lib/staff-auth";
import { openCashierLease } from "@/lib/cashier-lease-client";
type Ref<T> = { current: T };
export function startCashierLifecycle(options: {
  session: StaffSession; eventId: string; lockError: string; unknownError: string;
  closingRef: Ref<boolean>; suspendedRef: Ref<boolean>;
  suspendCashierRef: Ref<(() => Promise<void>) | null>;
  cashierLeaseRef: Ref<Awaited<ReturnType<typeof openCashierLease>> | null>;
  setIsUnlocked: (value: boolean) => void; setAccessError: (value: string | null) => void;
}) {
  const { closingRef, suspendedRef, suspendCashierRef, cashierLeaseRef, setIsUnlocked, setAccessError } = options;
    const initialSession = options.session;
    let stopped = false;
    let generation = 0;
    let lease: Awaited<ReturnType<typeof openCashierLease>> | null = null;
    let detaching: Promise<void> = Promise.resolve();
    let interval: number | undefined;
    const current = (epoch: number) => !stopped && !closingRef.current && generation === epoch;
    const stopHeartbeat = () => {
      if (interval !== undefined) window.clearInterval(interval);
      interval = undefined;
    };
    const detachCurrent = () => {
      const previous = lease;
      lease = null;
      if (previous) detaching = Promise.all([detaching, previous.detach()]).then(() => undefined);
      return detaching;
    };
    const suspend = () => {
      ++generation; // Invalidate every response from the previous activation.
      suspendedRef.current = true;
      setIsUnlocked(false);
      stopHeartbeat();
      return detachCurrent(); // Keep the server lease and persistent instance ID.
    };
    suspendCashierRef.current = suspend;

    async function activate(revalidate: boolean) {
      if (stopped || closingRef.current) return;
      const epoch = ++generation;
      suspendedRef.current = true;
      setIsUnlocked(false);
      setAccessError(null);
      stopHeartbeat();
      try {
        await detachCurrent();
        if (!current(epoch)) return;
        const session = revalidate ? await refreshStaffSession() : initialSession;
        if (!current(epoch)) return;
        if (!session || (session.role !== "admin" && session.role !== "cashier")) {
          closingRef.current = true;
          window.location.href = session ? "/staff" : "/team/login";
          return;
        }
        if (session.userId !== initialSession.userId || session.role !== initialSession.role || session.username !== initialSession.username || (session.cashierEventId || "") !== (initialSession.cashierEventId || "") || session.workstationId !== initialSession.workstationId) {
          // A different staff context must mount a fresh page, not reuse cached orders.
          closingRef.current = true;
          window.location.href = "/caisse";
          return;
        }
        const active = await openCashierLease(options.eventId, session.workstationId);
        if (!current(epoch)) { await active.detach(); return; }
        lease = active;
        cashierLeaseRef.current = active;
        await (!revalidate && active.handedOff ? active.heartbeat() : active.acquire());
        if (!current(epoch)) return;
        suspendedRef.current = false;
        setIsUnlocked(true);

        let busy = false;
        interval = window.setInterval(() => {
          if (!current(epoch) || suspendedRef.current || busy) return;
          busy = true;
          void active.heartbeat().catch((error: unknown) => {
            if (current(epoch) && !suspendedRef.current) {
              stopHeartbeat();
              setAccessError(`${options.lockError}: ${error instanceof Error ? error.message : options.unknownError}`);
              setIsUnlocked(false);
            }
          }).finally(() => { busy = false; });
        }, 30000);
      } catch (e: unknown) {
        if (current(epoch)) {
          setAccessError(`${options.lockError}: ${e instanceof Error ? e.message : options.unknownError}`);
          setIsUnlocked(false);
        }
      }
    }

    const hide = () => {
      void suspend().catch(() => undefined);
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted && !closingRef.current) void activate(true);
    };
    void activate(false);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", restored);
    return { suspend, dispose: () => {
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", restored);
      stopped = true;
      if (suspendCashierRef.current === suspend) suspendCashierRef.current = null;
      void suspend().catch(() => undefined);
    } };
}
