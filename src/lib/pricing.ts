type PricedItem = {
  id?: string;
  name: string;
  qty: number;
  price?: number;
};

const FALLBACK_PRICE_BY_ID = new Map<string, number>([
  ["ingwersaft", 5],
  ["hibiskussaft", 5],
  ["puff-puff-1", 5],
  ["plantain-chips", 5],
  ["bhb-1-2-kamerun-veganer-teller", 15],
  ["attieke-poulet-2-elfenbeinkuste", 15],
  ["batbout-mit-hahnchenfullung-2-marokko", 15],
  ["pollo-fino-2", 10],
  ["bh-1-2", 10],
  ["batbout-mit-bohnenfullung-2", 10],
]);

function normalizeItemName(name?: string) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isDipItem(item: Pick<PricedItem, "id" | "name">) {
  if (String(item.id || "").startsWith("dip-")) return true;
  const normalized = normalizeItemName(item.name);
  return normalized.includes("sauce") && (normalized.includes("grune") || normalized.includes("chili"));
}

function unitPrice(item: PricedItem) {
  if (typeof item.price === "number" && Number.isFinite(item.price)) return item.price;
  const id = String(item.id || "");
  if (FALLBACK_PRICE_BY_ID.has(id)) return FALLBACK_PRICE_BY_ID.get(id) || 0;
  return 0;
}

export function calculateOrderTotalCents(items: PricedItem[]) {
  let dipQtySoFar = 0;
  let totalEur = 0;

  for (const item of items) {
    const qty = Math.max(0, Number(item.qty || 0));
    if (qty <= 0) continue;

    if (isDipItem(item)) {
      const paidQty = Math.max(0, dipQtySoFar + qty - 1) - Math.max(0, dipQtySoFar - 1);
      totalEur += paidQty * 1;
      dipQtySoFar += qty;
      continue;
    }

    totalEur += unitPrice(item) * qty;
  }

  return Math.round(totalEur * 100);
}
