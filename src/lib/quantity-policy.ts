import type { ItemAvailability } from "@/lib/menu-settings";
import type { Lang } from "@/lib/translations";

export const AVAILABILITY_LOCK = "afrofood:availability:v1";

export function isQuantityZero(availability?: Partial<ItemAvailability>) {
  return availability?.status === "limited" && Number(availability.remainingQty ?? 0) <= 0;
}

export function quantityZeroLabel(lang: Lang) {
  return { de: "Bestand 0 – bitte prüfen", fr: "Stock 0 – à vérifier", en: "Stock 0 – please check" }[lang];
}
