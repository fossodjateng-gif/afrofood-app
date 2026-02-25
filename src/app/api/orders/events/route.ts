import { addOrderEventsClient, removeOrderEventsClient } from "@/lib/order-events";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      addOrderEventsClient(controller);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          // no-op
        }
      }, 20000);

      const cleanup = () => {
        clearInterval(heartbeat);
        removeOrderEventsClient(controller);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      // client disconnected
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

