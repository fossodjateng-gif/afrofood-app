export type CardIdentity = {
  workstationId?: string;
  userId: string;
  username: string;
  eventId: string;
  items: Array<{ id: string; qty: number }>;
};

// Prices and labels are resolved by the server, never fingerprinted as authority.
export function cardIdentityPayload(input: CardIdentity) {
  return JSON.stringify({
    userId: input.userId, username: input.username.trim().toLowerCase(), eventId: input.eventId,
    ...(input.workstationId ? { workstationId: input.workstationId } : {}),
    items: input.items.map(({ id, qty }) => ({ id, qty })),
  });
}
