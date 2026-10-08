export type CardIdentity = {
  userId: string;
  username: string;
  eventId: string;
  items: Array<{ id: string; qty: number }>;
};

// Prices and labels are resolved by the server, never fingerprinted as authority.
export function cardIdentityPayload(input: CardIdentity) {
  return JSON.stringify({
    userId: input.userId, username: input.username.trim().toLowerCase(), eventId: input.eventId,
    items: input.items.map(({ id, qty }) => ({ id, qty })),
  });
}
