type OrderServerEventType =
  | "ORDER_CREATED"
  | "PAYMENT_VALIDATED"
  | "ORDER_READY"
  | "ORDER_DONE"
  | "ORDER_STATUS_CHANGED";

export type OrderServerEvent = {
  type: OrderServerEventType;
  orderId: string;
  at: number;
  status?: string;
  previousStatus?: string;
};

type SseClient = ReadableStreamDefaultController<Uint8Array>;

declare global {
  // eslint-disable-next-line no-var
  var __afrofoodOrderSseClients: Set<SseClient> | undefined;
}

const encoder = new TextEncoder();

function getClients() {
  if (!globalThis.__afrofoodOrderSseClients) {
    globalThis.__afrofoodOrderSseClients = new Set<SseClient>();
  }
  return globalThis.__afrofoodOrderSseClients;
}

export function addOrderEventsClient(controller: SseClient) {
  const clients = getClients();
  clients.add(controller);
  controller.enqueue(
    encoder.encode(`event: connected\ndata: ${JSON.stringify({ ok: true, at: Date.now() })}\n\n`)
  );
}

export function removeOrderEventsClient(controller: SseClient) {
  getClients().delete(controller);
}

export function publishOrderEvent(event: OrderServerEvent) {
  const payload = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  const clients = getClients();

  for (const client of clients) {
    try {
      client.enqueue(payload);
    } catch {
      clients.delete(client);
    }
  }
}

