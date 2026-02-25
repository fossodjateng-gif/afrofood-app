export type OrderSyncReason =
  | "ORDER_CREATED"
  | "PAYMENT_VALIDATED"
  | "ORDER_READY"
  | "ORDER_DONE"
  | "ORDER_STATUS_CHANGED";

type OrderSyncMessage = {
  reason: OrderSyncReason;
  at: number;
  orderId?: string;
};

const STORAGE_KEY = "af_order_sync_event";
const WINDOW_EVENT = "af-order-sync";
const CHANNEL_NAME = "af-order-sync";

function getBroadcastChannel() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  return new BroadcastChannel(CHANNEL_NAME);
}

export function emitOrderSync(reason: OrderSyncReason, orderId?: string) {
  if (typeof window === "undefined") return;
  const message: OrderSyncMessage = { reason, at: Date.now(), orderId };

  window.dispatchEvent(new CustomEvent(WINDOW_EVENT, { detail: message }));

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
  } catch {
    // no-op
  }

  const channel = getBroadcastChannel();
  if (channel) {
    channel.postMessage(message);
    channel.close();
  }
}

export function subscribeOrderSync(handler: (message: OrderSyncMessage) => void) {
  if (typeof window === "undefined") return () => {};

  const onWindow = (event: Event) => {
    const custom = event as CustomEvent<OrderSyncMessage>;
    if (custom?.detail) handler(custom.detail);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      handler(JSON.parse(event.newValue) as OrderSyncMessage);
    } catch {
      // no-op
    }
  };

  const channel = getBroadcastChannel();
  const onChannel = (event: MessageEvent<OrderSyncMessage>) => {
    if (event?.data) handler(event.data);
  };
  const sse = new EventSource("/api/orders/events");
  const onSseMessage = (event: MessageEvent<string>) => {
    if (!event.data) return;
    try {
      const data = JSON.parse(event.data) as {
        type?: OrderSyncReason;
        at?: number;
        orderId?: string;
      };
      if (!data.type) return;
      handler({
        reason: data.type,
        at: Number(data.at || Date.now()),
        orderId: data.orderId,
      });
    } catch {
      // ignore malformed events
    }
  };

  window.addEventListener(WINDOW_EVENT, onWindow as EventListener);
  window.addEventListener("storage", onStorage);
  if (channel) channel.addEventListener("message", onChannel as EventListener);
  sse.addEventListener("message", onSseMessage as EventListener);

  return () => {
    window.removeEventListener(WINDOW_EVENT, onWindow as EventListener);
    window.removeEventListener("storage", onStorage);
    if (channel) {
      channel.removeEventListener("message", onChannel as EventListener);
      channel.close();
    }
    sse.removeEventListener("message", onSseMessage as EventListener);
    sse.close();
  };
}
