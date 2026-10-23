import { requireStaffWorkstation, StaffAuthError } from "@/lib/staff-session-server";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const initial = await requireStaffWorkstation(req);
    let timer: ReturnType<typeof setInterval> | undefined;
    let busy = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const close = () => { if (timer) clearInterval(timer); try { controller.close(); } catch {} };
        req.signal.addEventListener("abort", close, { once: true });
        // Private invalidations contain no other event's IDs or order data.
        timer = setInterval(async () => {
          if (busy) return;
          busy = true;
          try {
            const current = await requireStaffWorkstation(req);
            if (current.id !== initial.id || current.cashierEventId !== initial.cashierEventId || current.workstationId !== initial.workstationId) { close(); return; }
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "PAYMENT_VALIDATED", at: Date.now() })}\n\n`));
          } catch { close(); } finally { busy = false; }
        }, 5000);
      },
      cancel() { if (timer) clearInterval(timer); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ ok: false, error: error instanceof StaffAuthError ? error.code : "session_unavailable" }, { status: error instanceof StaffAuthError ? error.status : 503 }); }
}
