import { sql } from "@/lib/db";
import { getMenuItemImagePath, MENU_CATALOG } from "@/lib/menu-catalog";
import type { Lang } from "@/lib/translations";

type MenuSettingsRow = {
  item_id: string;
  price: number;
  visible: boolean;
};

type EventMenuSettingsRow = {
  event_id: string;
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
  cashlessEnabled: boolean;
};

export type ItemAvailabilityStatus = "available" | "limited" | "blocked";

export type ItemAvailability = {
  status: ItemAvailabilityStatus;
  remainingQty: number | null;
  resumeAt: string | null;
};

export type StoreConfig = {
  activeEventId: string;
  activeEventName: string;
  events: EventProfile[];
};

export type EventProfile = {
  id: string;
  name: string;
  preorderEnabled?: boolean;
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
const ITEM_AVAILABILITY_KEY = "item_availability";

const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  cashEnabled: true,
  cardEnabled: true,
  cashlessEnabled: true,
};

const DEFAULT_STORE_CONFIG: StoreConfig = {
  activeEventId: "",
  activeEventName: "",
  events: [],
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
  eventId?: string;
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
	    CREATE TABLE IF NOT EXISTS event_menu_item_settings (
	      event_id TEXT NOT NULL,
	      item_id TEXT NOT NULL,
	      price NUMERIC(10,2) NOT NULL,
	      visible BOOLEAN NOT NULL DEFAULT TRUE,
	      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      PRIMARY KEY (event_id, item_id)
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
    cashlessEnabled: raw?.cashlessEnabled !== false,
  };
}

function paymentConfigKey(eventId?: string) {
  const normalizedEventId = String(eventId || "").trim();
  return normalizedEventId ? `${PAYMENT_CONFIG_KEY}:${normalizedEventId}` : PAYMENT_CONFIG_KEY;
}

function itemAvailabilityKey(eventId?: string) {
  const normalizedEventId = String(eventId || "").trim();
  return normalizedEventId ? `${ITEM_AVAILABILITY_KEY}:${normalizedEventId}` : ITEM_AVAILABILITY_KEY;
}

function normalizeResumeAt(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function normalizeAvailability(value: unknown): ItemAvailability {
  const raw = value as Partial<ItemAvailability> | null;
  const statusRaw = String(raw?.status || "").trim();
  const remainingQtyRaw = Number(raw?.remainingQty);
  const remainingQty =
    Number.isFinite(remainingQtyRaw) && remainingQtyRaw >= 0 ? Math.floor(remainingQtyRaw) : null;
  const resumeAt = normalizeResumeAt(raw?.resumeAt);
  const status: ItemAvailabilityStatus =
    statusRaw === "limited" || statusRaw === "blocked" || statusRaw === "available"
      ? (statusRaw as ItemAvailabilityStatus)
      : "available";

  if (resumeAt) {
    const resumeTs = new Date(resumeAt).getTime();
    if (Number.isFinite(resumeTs) && resumeTs <= Date.now()) {
      return { status: "available", remainingQty: null, resumeAt: null };
    }
  }

  if (status === "available") {
    return { status: "available", remainingQty: null, resumeAt: null };
  }

  return {
    status,
    remainingQty,
    resumeAt,
  };
}

function normalizeAvailabilityMap(value: unknown): Record<string, ItemAvailability> {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const result: Record<string, ItemAvailability> = {};
  for (const [itemId, entry] of Object.entries(raw)) {
    const cleanId = String(itemId || "").trim();
    if (!cleanId) continue;
    result[cleanId] = normalizeAvailability(entry);
  }
  return result;
}

export async function getPaymentConfig(eventId?: string): Promise<PaymentConfig> {
  await ensureMenuSettingsSchema();
  const key = paymentConfigKey(eventId);
  const rows = (await sql`
    SELECT setting_key, setting_value
    FROM app_settings
    WHERE setting_key = ${key}
    LIMIT 1
  `) as AppSettingRow[];

  if (rows.length === 0) {
    if (eventId) return getPaymentConfig();
    return DEFAULT_PAYMENT_CONFIG;
  }
  return toPaymentConfig(rows[0]?.setting_value);
}

export async function upsertPaymentConfig(config: PaymentConfig, eventId?: string) {
  await ensureMenuSettingsSchema();
  const normalized = toPaymentConfig(config);
  const key = paymentConfigKey(eventId);

  await sql`
    INSERT INTO app_settings (setting_key, setting_value, updated_at)
    VALUES (${key}, ${JSON.stringify(normalized)}::jsonb, NOW())
    ON CONFLICT (setting_key)
    DO UPDATE SET
      setting_value = EXCLUDED.setting_value,
      updated_at = NOW()
  `;
}

export async function getItemAvailabilityMap(eventId?: string): Promise<Record<string, ItemAvailability>> {
  await ensureMenuSettingsSchema();
  const key = itemAvailabilityKey(eventId);
  const rows = (await sql`
    SELECT setting_value
    FROM app_settings
    WHERE setting_key = ${key}
    LIMIT 1
  `) as Array<{ setting_value: unknown }>;

  if (rows.length === 0) return {};
  return normalizeAvailabilityMap(rows[0]?.setting_value);
}

async function saveItemAvailabilityMap(entries: Record<string, ItemAvailability>, eventId?: string) {
  await ensureMenuSettingsSchema();
  const key = itemAvailabilityKey(eventId);
  await sql`
    INSERT INTO app_settings (setting_key, setting_value, updated_at)
    VALUES (${key}, ${JSON.stringify(entries)}::jsonb, NOW())
    ON CONFLICT (setting_key)
    DO UPDATE SET
      setting_value = EXCLUDED.setting_value,
      updated_at = NOW()
  `;
}

export async function upsertItemAvailability(
  itemIdInput: string,
  availability: Partial<ItemAvailability>,
  eventId?: string
) {
  const itemId = String(itemIdInput || "").trim();
  if (!itemId) throw new Error("Missing itemId");
  const current = await getItemAvailabilityMap(eventId);
  const next = {
    ...current,
    [itemId]: normalizeAvailability({
      ...current[itemId],
      ...availability,
    }),
  };
  await saveItemAvailabilityMap(next, eventId);
}

export async function consumeItemAvailability(
  itemsInput: Array<{ id?: string; qty?: number }>,
  eventId?: string
) {
  const current = await getItemAvailabilityMap(eventId);
  if (Object.keys(current).length === 0) return;
  const next = { ...current };

  for (const raw of itemsInput) {
    const itemId = String(raw?.id || "").trim();
    const qty = Math.max(0, Number(raw?.qty || 0));
    if (!itemId || qty <= 0) continue;
    const entry = normalizeAvailability(next[itemId]);
    if (entry.status === "available") continue;

    if (entry.status === "blocked") {
      throw new Error(`Item unavailable: ${itemId}`);
    }

    const remaining = Number(entry.remainingQty ?? 0);
    if (remaining < qty) {
      throw new Error(`Item limited: ${itemId}`);
    }

    next[itemId] = normalizeAvailability({
      ...entry,
      remainingQty: remaining - qty,
    });
  }

  await saveItemAvailabilityMap(next, eventId);
}

export async function restoreItemAvailability(
  itemsInput: Array<{ id?: string; qty?: number }>,
  eventId?: string
) {
  const current = await getItemAvailabilityMap(eventId);
  if (Object.keys(current).length === 0) return;
  const next = { ...current };

  for (const raw of itemsInput) {
    const itemId = String(raw?.id || "").trim();
    const qty = Math.max(0, Number(raw?.qty || 0));
    if (!itemId || qty <= 0) continue;
    const entry = normalizeAvailability(next[itemId]);
    if (entry.status !== "limited") continue;

    next[itemId] = normalizeAvailability({
      ...entry,
      remainingQty: Math.max(0, Number(entry.remainingQty ?? 0) + qty),
    });
  }

  await saveItemAvailabilityMap(next, eventId);
}

function toStoreConfig(value: unknown): StoreConfig {
  const raw = value as Partial<StoreConfig> | null;
  const rawEvents = Array.isArray(raw?.events) ? raw?.events : [];
  const eventMap = new Map<string, EventProfile>();
  for (const entry of rawEvents) {
    const id = String((entry as Partial<EventProfile>)?.id || "").trim();
    const name = String((entry as Partial<EventProfile>)?.name || "").trim();
    if (!id || !name || eventMap.has(id)) continue;
    eventMap.set(id, {
      id,
      name,
      preorderEnabled: (entry as Partial<EventProfile>)?.preorderEnabled === true,
    });
  }
  const activeEventId = String(raw?.activeEventId || "").trim();
  const activeEventName = String(raw?.activeEventName || "").trim();
  const activeFromList = activeEventId ? eventMap.get(activeEventId) : undefined;
  return {
    activeEventId: activeFromList?.id || activeEventId,
    activeEventName: activeFromList?.name || activeEventName,
    events: [...eventMap.values()],
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

export async function getResolvedMenuSections(eventId?: string) {
  await ensureMenuSettingsSchema();

  const rows = await sql`
    SELECT item_id, price, visible
    FROM menu_item_settings
  `;
  const eventRows = eventId
    ? ((await sql`
        SELECT event_id, item_id, price, visible
        FROM event_menu_item_settings
        WHERE event_id = ${eventId}
      `) as EventMenuSettingsRow[])
    : [];
  const customRows = (await sql`
    SELECT item_id, section_id, name_de, name_fr, name_en, desc_de, desc_fr, desc_en, price, visible
    FROM custom_menu_items
    ORDER BY created_at ASC
  `) as CustomMenuItemRow[];
  const availabilityMap = await getItemAvailabilityMap(eventId);

  const settingsMap = new Map<string, { price: number; visible: boolean }>();
  for (const raw of rows as MenuSettingsRow[]) {
    const itemId = String(raw.item_id || "").trim();
    if (!itemId) continue;
    settingsMap.set(itemId, {
      price: Number(raw.price),
      visible: Boolean(raw.visible),
    });
  }
  const eventSettingsMap = new Map<string, { price: number; visible: boolean }>();
  for (const raw of eventRows) {
    const itemId = String(raw.item_id || "").trim();
    if (!itemId) continue;
    eventSettingsMap.set(itemId, {
      price: Number(raw.price),
      visible: Boolean(raw.visible),
    });
  }

  const resolved = MENU_CATALOG.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      const setting = eventSettingsMap.get(item.id) ?? settingsMap.get(item.id);
      return {
        ...item,
        imagePath: item.imagePath ?? getMenuItemImagePath(item.id),
        price: setting ? Number(setting.price) : Number(item.basePrice),
        visible: setting ? Boolean(setting.visible) : true,
        availability: availabilityMap[item.id] ?? normalizeAvailability(null),
      };
    }),
  }));

  for (const row of customRows) {
    const setting = eventSettingsMap.get(row.item_id) ?? settingsMap.get(row.item_id);
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
      imagePath: getMenuItemImagePath(row.item_id),
      basePrice: Number(row.price),
      price: setting ? Number(setting.price) : Number(row.price),
      visible: setting ? Boolean(setting.visible) : Boolean(row.visible),
      availability: availabilityMap[row.item_id] ?? normalizeAvailability(null),
    });
  }

  return resolved;
}

export async function upsertMenuItemSetting(payload: {
  itemId: string;
  price: number;
  visible: boolean;
  eventId?: string;
}) {
  await ensureMenuSettingsSchema();
  const itemId = String(payload.itemId || "").trim();
  const price = Number(payload.price);
  const visible = Boolean(payload.visible);
  const eventId = String(payload.eventId || "").trim();

  if (!itemId) throw new Error("Missing itemId");
  if (!Number.isFinite(price) || price < 0) throw new Error("Invalid price");

  if (eventId) {
    await sql`
      INSERT INTO event_menu_item_settings (event_id, item_id, price, visible, updated_at)
      VALUES (${eventId}, ${itemId}, ${price}, ${visible}, NOW())
      ON CONFLICT (event_id, item_id)
      DO UPDATE SET
        price = EXCLUDED.price,
        visible = EXCLUDED.visible,
        updated_at = NOW()
    `;
    return;
  }

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
  const eventId = String(input.eventId || "").trim();

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
      ${eventId ? false : true},
      NOW(),
      NOW()
    )
  `;

  if (eventId) {
    await upsertMenuItemSetting({
      itemId,
      price,
      visible: true,
      eventId,
    });
  }

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

  await sql`
    DELETE FROM event_menu_item_settings
    WHERE item_id = ${itemId}
  `;
}
