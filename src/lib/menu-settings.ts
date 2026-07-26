import { sql } from "@/lib/db";
import { MENU_CATALOG } from "@/lib/menu-catalog";
import type { Lang } from "@/lib/translations";

type MenuSettingsRow = {
  item_id: string;
  price: number;
  visible: boolean;
};

type AppSettingRow = {
  setting_key: string;
  setting_value: unknown;
};

type CustomMenuItemRow = {
  item_id: string;
  section_id: string;
  name_de: string;
  name_fr: string;
  name_en: string;
  desc_de: string | null;
  desc_fr: string | null;
  desc_en: string | null;
  price: number;
  visible: boolean;
};

export type PaymentConfig = {
  cashEnabled: boolean;
  cardEnabled: boolean;
};

export type StoreConfig = {
  activeEventName: string;
};

export type TapToPayConfig = {
  awarenessSeen: boolean;
  termsViewed: boolean;
  termsAccepted: boolean;
  educationSeen: boolean;
  readinessStatus: "not_prepared" | "preparing" | "ready";
};

const PAYMENT_CONFIG_KEY = "payment_config";
const STORE_CONFIG_KEY = "store_config";
const TAP_TO_PAY_CONFIG_KEY = "tap_to_pay_config";

const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  cashEnabled: true,
  cardEnabled: true,
};

const DEFAULT_STORE_CONFIG: StoreConfig = {
  activeEventName: "",
};

const DEFAULT_TAP_TO_PAY_CONFIG: TapToPayConfig = {
  awarenessSeen: false,
  termsViewed: false,
  termsAccepted: false,
  educationSeen: false,
  readinessStatus: "not_prepared",
};

export type CustomMenuCategory = "dish" | "drink" | "dip";

export type CreateCustomMenuItemInput = {
  category: CustomMenuCategory;
  name: string;
  description?: string;
  price: number;
};

export async function ensureMenuSettingsSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS menu_item_settings (
      item_id TEXT PRIMARY KEY,
      price NUMERIC(10,2) NOT NULL,
      visible BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS custom_menu_items (
      item_id TEXT PRIMARY KEY,
      section_id TEXT NOT NULL,
      name_de TEXT NOT NULL,
      name_fr TEXT NOT NULL,
      name_en TEXT NOT NULL,
      desc_de TEXT,
      desc_fr TEXT,
      desc_en TEXT,
      price NUMERIC(10,2) NOT NULL,
      visible BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

function categoryToSectionId(category: CustomMenuCategory) {
  if (category === "dip") return "dips";
  if (category === "drink") return "drinks";
  return "custom-dishes";
}

function sectionTitleById(sectionId: string): Record<Lang, string> {
  if (sectionId === "custom-dishes") {
    return { de: "🍽 Gerichte", fr: "🍽 Plats", en: "🍽 Dishes" };
  }
  if (sectionId === "drinks") {
    return { de: "🥤 Immungetranke", fr: "🥤 Boissons bien-etre", en: "🥤 Wellness drinks" };
  }
  if (sectionId === "dips") {
    return { de: "🥣 Dips", fr: "🥣 Dips", en: "🥣 Dips" };
  }
  return { de: "Menu", fr: "Menu", en: "Menu" };
}

function toPaymentConfig(value: unknown): PaymentConfig {
  const raw = value as Partial<PaymentConfig> | null;
  return {
    cashEnabled: raw?.cashEnabled !== false,
    cardEnabled: raw?.cardEnabled !== false,
  };
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  await ensureMenuSettingsSchema();
  const rows = (await sql`
    SELECT setting_key, setting_value
    FROM app_settings
    WHERE setting_key = ${PAYMENT_CONFIG_KEY}
    LIMIT 1
  `) as AppSettingRow[];

  if (rows.length === 0) return DEFAULT_PAYMENT_CONFIG;
  return toPaymentConfig(rows[0]?.setting_value);
}

export async function upsertPaymentConfig(config: PaymentConfig) {
  await ensureMenuSettingsSchema();
  const normalized = toPaymentConfig(config);

  await sql`
    INSERT INTO app_settings (setting_key, setting_value, updated_at)
    VALUES (${PAYMENT_CONFIG_KEY}, ${JSON.stringify(normalized)}::jsonb, NOW())
    ON CONFLICT (setting_key)
    DO UPDATE SET
      setting_value = EXCLUDED.setting_value,
      updated_at = NOW()
  `;
}

function toStoreConfig(value: unknown): StoreConfig {
  const raw = value as Partial<StoreConfig> | null;
  return {
    activeEventName: String(raw?.activeEventName || "").trim(),
  };
}

export async function getStoreConfig(): Promise<StoreConfig> {
  await ensureMenuSettingsSchema();
  const rows = (await sql`
    SELECT setting_key, setting_value
    FROM app_settings
    WHERE setting_key = ${STORE_CONFIG_KEY}
    LIMIT 1
  `) as AppSettingRow[];

  if (rows.length === 0) return DEFAULT_STORE_CONFIG;
  return toStoreConfig(rows[0]?.setting_value);
}

export async function upsertStoreConfig(config: StoreConfig) {
  await ensureMenuSettingsSchema();
  const normalized = toStoreConfig(config);

  await sql`
    INSERT INTO app_settings (setting_key, setting_value, updated_at)
    VALUES (${STORE_CONFIG_KEY}, ${JSON.stringify(normalized)}::jsonb, NOW())
    ON CONFLICT (setting_key)
    DO UPDATE SET
      setting_value = EXCLUDED.setting_value,
      updated_at = NOW()
  `;
}

function toTapToPayConfig(value: unknown): TapToPayConfig {
  const raw = value as Partial<TapToPayConfig> | null;
  const readiness = String(raw?.readinessStatus || "").trim();
  return {
    awarenessSeen: Boolean(raw?.awarenessSeen),
    termsViewed: Boolean(raw?.termsViewed),
    termsAccepted: Boolean(raw?.termsAccepted),
    educationSeen: Boolean(raw?.educationSeen),
    readinessStatus:
      readiness === "preparing" || readiness === "ready" || readiness === "not_prepared"
        ? (readiness as TapToPayConfig["readinessStatus"])
        : "not_prepared",
  };
}

export async function getTapToPayConfig(): Promise<TapToPayConfig> {
  await ensureMenuSettingsSchema();
  const rows = (await sql`
    SELECT setting_key, setting_value
    FROM app_settings
    WHERE setting_key = ${TAP_TO_PAY_CONFIG_KEY}
    LIMIT 1
  `) as AppSettingRow[];

  if (rows.length === 0) return DEFAULT_TAP_TO_PAY_CONFIG;
  return toTapToPayConfig(rows[0]?.setting_value);
}

export async function upsertTapToPayConfig(config: Partial<TapToPayConfig>) {
  await ensureMenuSettingsSchema();
  const current = await getTapToPayConfig();
  const merged = toTapToPayConfig({
    ...current,
    ...config,
  });

  await sql`
    INSERT INTO app_settings (setting_key, setting_value, updated_at)
    VALUES (${TAP_TO_PAY_CONFIG_KEY}, ${JSON.stringify(merged)}::jsonb, NOW())
    ON CONFLICT (setting_key)
    DO UPDATE SET
      setting_value = EXCLUDED.setting_value,
      updated_at = NOW()
  `;
}

export async function getResolvedMenuSections() {
  await ensureMenuSettingsSchema();

  const rows = await sql`
    SELECT item_id, price, visible
    FROM menu_item_settings
  `;
  const customRows = (await sql`
    SELECT item_id, section_id, name_de, name_fr, name_en, desc_de, desc_fr, desc_en, price, visible
    FROM custom_menu_items
    ORDER BY created_at ASC
  `) as CustomMenuItemRow[];

  const settingsMap = new Map<string, { price: number; visible: boolean }>();
  for (const raw of rows as MenuSettingsRow[]) {
    const itemId = String(raw.item_id || "").trim();
    if (!itemId) continue;
    settingsMap.set(itemId, {
      price: Number(raw.price),
      visible: Boolean(raw.visible),
    });
  }

  const resolved = MENU_CATALOG.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      const setting = settingsMap.get(item.id);
      return {
        ...item,
        price: setting ? Number(setting.price) : Number(item.basePrice),
        visible: setting ? Boolean(setting.visible) : true,
      };
    }),
  }));

  for (const row of customRows) {
    const setting = settingsMap.get(row.item_id);
    const targetSectionId = String(row.section_id || "").trim() || "custom-dishes";
    let section = resolved.find((s) => s.id === targetSectionId);
    if (!section) {
      section = {
        id: targetSectionId,
        title: sectionTitleById(targetSectionId),
        items: [],
      };
      resolved.push(section);
    }
    section.items.push({
      id: row.item_id,
      name: {
        de: row.name_de,
        fr: row.name_fr,
        en: row.name_en,
      },
      desc: {
        de: String(row.desc_de || ""),
        fr: String(row.desc_fr || ""),
        en: String(row.desc_en || ""),
      },
      basePrice: Number(row.price),
      price: setting ? Number(setting.price) : Number(row.price),
      visible: setting ? Boolean(setting.visible) : Boolean(row.visible),
    });
  }

  return resolved;
}

export async function upsertMenuItemSetting(payload: {
  itemId: string;
  price: number;
  visible: boolean;
}) {
  await ensureMenuSettingsSchema();
  const itemId = String(payload.itemId || "").trim();
  const price = Number(payload.price);
  const visible = Boolean(payload.visible);

  if (!itemId) throw new Error("Missing itemId");
  if (!Number.isFinite(price) || price < 0) throw new Error("Invalid price");

  await sql`
    INSERT INTO menu_item_settings (item_id, price, visible, updated_at)
    VALUES (${itemId}, ${price}, ${visible}, NOW())
    ON CONFLICT (item_id)
    DO UPDATE SET
      price = EXCLUDED.price,
      visible = EXCLUDED.visible,
      updated_at = NOW()
  `;
}

function createCustomItemId() {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const rand = Math.floor(Math.random() * 900 + 100);
  return `custom-${stamp}-${rand}`;
}

export async function createCustomMenuItem(input: CreateCustomMenuItemInput) {
  await ensureMenuSettingsSchema();
  const name = String(input.name || "").trim();
  const description = String(input.description || "").trim();
  const price = Number(input.price);
  const category = input.category;

  if (!name) throw new Error("Missing name");
  if (!Number.isFinite(price) || price < 0) throw new Error("Invalid price");
  if (category !== "dish" && category !== "drink" && category !== "dip") {
    throw new Error("Invalid category");
  }

  const itemId = createCustomItemId();
  const sectionId = categoryToSectionId(category);

  await sql`
    INSERT INTO custom_menu_items (
      item_id, section_id, name_de, name_fr, name_en, desc_de, desc_fr, desc_en, price, visible, created_at, updated_at
    )
    VALUES (
      ${itemId},
      ${sectionId},
      ${name},
      ${name},
      ${name},
      ${description || null},
      ${description || null},
      ${description || null},
      ${price},
      true,
      NOW(),
      NOW()
    )
  `;

  return { itemId };
}

export async function getCustomItemIds() {
  await ensureMenuSettingsSchema();
  const rows = (await sql`
    SELECT item_id
    FROM custom_menu_items
  `) as Array<{ item_id: string }>;
  return rows.map((r) => String(r.item_id || "").trim()).filter(Boolean);
}

export async function deleteCustomMenuItem(itemIdInput: string) {
  await ensureMenuSettingsSchema();
  const itemId = String(itemIdInput || "").trim();
  if (!itemId) throw new Error("Missing itemId");

  const rows = (await sql`
    DELETE FROM custom_menu_items
    WHERE item_id = ${itemId}
    RETURNING item_id
  `) as Array<{ item_id: string }>;

  if (rows.length === 0) {
    throw new Error("Custom item not found");
  }

  await sql`
    DELETE FROM menu_item_settings
    WHERE item_id = ${itemId}
  `;
}
