import type { Lang } from "@/lib/translations";

export type LocalizedText = Record<Lang, string>;

export type MenuTag = "VEGAN" | "CHICKEN";

export type CatalogMenuItem = {
  id: string;
  name: LocalizedText;
  basePrice: number;
  desc?: LocalizedText;
  tags?: MenuTag[];
};

export type CatalogSection = {
  id: string;
  title: LocalizedText;
  items: CatalogMenuItem[];
};

export const MENU_CATALOG: CatalogSection[] = [
  {
    id: "dips",
    title: { de: "Dips", fr: "Dips", en: "Dips" },
    items: [
      {
        id: "dip-green",
        name: {
          de: "Grune Sauce (nicht scharf)",
          fr: "Sauce verte (douce)",
          en: "Green sauce (mild)",
        },
        basePrice: 0,
        desc: {
          de: "1. Dip kostenlos, ab dem 2. Dip +1 EUR",
          fr: "1er dip gratuit, a partir du 2e dip +1 EUR",
          en: "1st dip free, from the 2nd dip +1 EUR",
        },
      },
      {
        id: "dip-chili",
        name: {
          de: "Chili Sauce (scharf)",
          fr: "Sauce chili (piquante)",
          en: "Chili sauce (hot)",
        },
        basePrice: 0,
        desc: {
          de: "1. Dip kostenlos, ab dem 2. Dip +1 EUR",
          fr: "1er dip gratuit, a partir du 2e dip +1 EUR",
          en: "1st dip free, from the 2nd dip +1 EUR",
        },
      },
    ],
  },
  {
    id: "drinks",
    title: { de: "Immungetranke", fr: "Boissons bien-etre", en: "Wellness drinks" },
    items: [
      {
        id: "ingwersaft",
        name: { de: "Ingwersaft", fr: "Jus de gingembre", en: "Ginger juice" },
        basePrice: 5,
        desc: {
          de: "Scharf-wurziger Frischekick",
          fr: "Boisson vive et epicee au gingembre",
          en: "Fresh and spicy ginger boost",
        },
      },
      {
        id: "hibiskussaft",
        name: { de: "Hibiskussaft", fr: "Jus d'hibiscus", en: "Hibiscus juice" },
        basePrice: 5,
        desc: {
          de: "Erfrischend und reich an Antioxidantien",
          fr: "Rafraichissant et riche en antioxydants",
          en: "Refreshing and rich in antioxidants",
        },
      },
    ],
  },
  {
    id: "finger-food",
    title: { de: "Fingerfood", fr: "Finger food", en: "Finger food" },
    items: [
      {
        id: "puff-puff-1",
        name: { de: "Puff-puff (1)", fr: "Puff-puff (1)", en: "Puff-puff (1)" },
        basePrice: 5,
        desc: {
          de: "Goldbraune Hefeballchen, aussen knusprig und innen fluffig",
          fr: "Beignets dores, croustillants dehors et moelleux dedans",
          en: "Golden dough balls, crispy outside and fluffy inside",
        },
        tags: ["VEGAN"],
      },
      {
        id: "plantain-chips",
        name: { de: "Plantain Chips", fr: "Chips de plantain", en: "Plantain chips" },
        basePrice: 5,
        desc: {
          de: "Knusprig frittierte Kochbananenscheiben",
          fr: "Tranches de plantain frites et croustillantes",
          en: "Crispy fried plantain slices",
        },
        tags: ["VEGAN"],
      },
    ],
  },
  {
    id: "africa-tour",
    title: { de: "Afrika entdecken", fr: "Voyage en Afrique", en: "Taste of Africa" },
    items: [
      {
        id: "bhb-1-2-kamerun-veganer-teller",
        name: {
          de: "BHB (1)(2) (Kamerun) - Veganer Teller",
          fr: "BHB (1)(2) (Cameroun) - Assiette vegane",
          en: "BHB (1)(2) (Cameroon) - Vegan plate",
        },
        basePrice: 15,
        desc: {
          de: "Gewurzter Bohneneintopf mit Maisbrei und Puff-puff",
          fr: "Haricot epice avec Bouillie de mais et puff-puff",
          en: "Spiced bean stew with corn mash and puff-puff",
        },
        tags: ["VEGAN"],
      },
      {
        id: "attieke-poulet-2-elfenbeinkuste",
        name: {
          de: "Attieke Poulet (2) (Elfenbeinkuste)",
          fr: "Attieke Poulet (2) (Cote d'Ivoire)",
          en: "Attieke Chicken (2) (Ivory Coast)",
        },
        basePrice: 15,
        desc: {
          de: "Maniok-Semola mit gegrilltem Pollo Fino und Tomaten-Zwiebel-Gurken Salat",
          fr: "Semoule de manioc avec pollo fino grille et Salade de tomates, oignons et concombres",
          en: "Cassava semolina with grilled pollo fino and Tomato, onion and cucumber salad",
        },
        tags: ["CHICKEN"],
      },
      {
        id: "batbout-mit-hahnchenfullung-2-marokko",
        name: {
          de: "Batbout mit Hahnchenfullung (2) (Marokko)",
          fr: "Batbout au poulet (2) (Maroc)",
          en: "Batbout with chicken filling (2) (Morocco)",
        },
        basePrice: 15,
        desc: {
          de: "Marokkanisches Fladenbrot mit gegrilltem Pollo Fino, Tomaten und Salat",
          fr: "Pain marocain garni de pollo fino grille, tomates et salade",
          en: "Moroccan flatbread with grilled pollo fino, tomatoes and salad",
        },
        tags: ["CHICKEN"],
      },
    ],
  },
  {
    id: "fusion",
    title: { de: "Fusion", fr: "Fusion", en: "Fusion" },
    items: [
      {
        id: "pollo-fino-2",
        name: { de: "Pollo Fino (2)", fr: "Pollo Fino (2)", en: "Pollo Fino (2)" },
        basePrice: 10,
        desc: {
          de: "Gegrilltes Hahnchen mit Plantain Chips und Puff-puff",
          fr: "Poulet grille avec chips de plantain et puff-puff",
          en: "Grilled chicken with plantain chips and puff-puff",
        },
        tags: ["CHICKEN"],
      },
      {
        id: "bh-1-2",
        name: { de: "BH (1)(2)", fr: "BH (1)(2)", en: "BH (1)(2)" },
        basePrice: 10,
        desc: {
          de: "Gewurzter Bohneneintopf mit Puff-puff und Plantain Chips",
          fr: "Haricot epice avec puff-puff et chips de plantain",
          en: "Spiced bean stew with puff-puff and plantain chips",
        },
        tags: ["VEGAN"],
      },
      {
        id: "batbout-mit-bohnenfullung-2",
        name: {
          de: "Batbout mit Bohnenfullung (2)",
          fr: "Batbout aux haricots (2)",
          en: "Batbout with bean filling (2)",
        },
        basePrice: 10,
        desc: {
          de: "Marokkanisches Fladenbrot mit gewurzten Bohnen, Tomaten und Salat",
          fr: "Pain marocain garni de haricot epice, tomates et salade",
          en: "Moroccan flatbread with spiced bean stew, tomatoes and salad",
        },
        tags: ["VEGAN"],
      },
    ],
  },
];

export function getCatalogItemIds() {
  return MENU_CATALOG.flatMap((section) => section.items.map((it) => it.id));
}

