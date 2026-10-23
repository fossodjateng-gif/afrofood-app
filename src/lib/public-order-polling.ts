// SSE is process-local. A slow fallback also catches updates from other instances.
export function startPublicOrderPolling(check: () => Promise<unknown>, visible: () => boolean,
  timer: Pick<typeof globalThis, "setInterval" | "clearInterval"> = globalThis) {
  let pending = false;
  let stopped = false;
  const interval = timer.setInterval(() => {
    if (stopped || pending || !visible()) return;
    pending = true;
    void check().catch(() => {}).finally(() => { pending = false; });
  }, 20000);
  return () => { stopped = true; timer.clearInterval(interval); };
}
