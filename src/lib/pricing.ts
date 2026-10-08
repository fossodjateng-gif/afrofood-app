export type PricingKind = "dip" | "regular";

export type PricedItem = {
  pricingKind?: PricingKind;
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

const FALLBACK_PRICE_BY_NAME = new Map<string, number>([
  ["ingwersaft", 5],
  ["hibiskussaft", 5],
  ["puff puff 1", 5],
  ["plantain chips", 5],
  ["bhb 1 2 kamerun veganer teller", 15],
  ["attieke poulet 2 elfenbeinkuste", 15],
  ["batbout mit hahnchenfullung 2 marokko", 15],
  ["pollo fino 2", 10],
  ["bh 1 2", 10],
  ["batbout mit bohnenfullung 2", 10],
]);

export const ADDITIONAL_DIP_CENTS = 100;

function normalizeItemName(name?: string) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isDipItem(item: Pick<PricedItem, "id" | "name" | "pricingKind">) {
  if (item.pricingKind) return item.pricingKind === "dip";
  if (String(item.id || "").startsWith("dip-")) return true;
  // Legacy tickets without IDs: recognize only the original sauce names.
  if (item.id) return false;
  return /^(grune|green|chili|sauce verte|sauce chili)( sauce)?( mild| hot| douce| piquante)?$/.test(normalizeItemName(item.name));
}

function unitPrice(item: PricedItem) {
  if (typeof item.price === "number" && Number.isFinite(item.price)) return item.price;
  const id = String(item.id || "");
  if (FALLBACK_PRICE_BY_ID.has(id)) return FALLBACK_PRICE_BY_ID.get(id) || 0;
  return FALLBACK_PRICE_BY_NAME.get(normalizeItemName(item.name)) || 0;
}

export function getOrderPriceBreakdown(items: PricedItem[]) {
  let dipQtySoFar = 0;
  let dipExtraCents = 0;
  const lineTotalsCents = items.map((item) => {
    const qty = Number.isFinite(Number(item.qty)) ? Math.max(0, Number(item.qty)) : 0;
    if (isDipItem(item)) {
      const paidQty = Math.max(0, dipQtySoFar + qty - 1) - Math.max(0, dipQtySoFar - 1);
      const cents = paidQty * ADDITIONAL_DIP_CENTS;
      dipQtySoFar += qty;
      dipExtraCents += cents;
      return cents;
    }
    return Math.round(unitPrice(item) * qty * 100);
  });
  return { lineTotalsCents, dipExtraCents, totalCents: lineTotalsCents.reduce((sum, cents) => sum + cents, 0) };
}

export function calculateOrderTotalCents(items: PricedItem[]) {
  return getOrderPriceBreakdown(items).totalCents;
}

export function getDipPriceLabel(lang: "de" | "fr" | "en") {
  const price = (ADDITIONAL_DIP_CENTS / 100).toFixed(2);
  return {
    de: `1. Dip gratis · weitere ${price.replace(".", ",")} €`,
    fr: `1er dip gratuit · suivants ${price.replace(".", ",")} €`,
    en: `1st dip free · additional ${price} €`,
  }[lang];
}

// Euro adapter for existing customer and receipt views.
export function getOrderBreakdownEur(items: PricedItem[], recordedAmountCents?: number | null) {
  const breakdown = getOrderPriceBreakdown(items);
  return {
    lineTotals: breakdown.lineTotalsCents.map((cents) => cents / 100),
    dipExtra: breakdown.dipExtraCents / 100,
    total: (typeof recordedAmountCents === "number" ? recordedAmountCents : breakdown.totalCents) / 100,
  };
}
