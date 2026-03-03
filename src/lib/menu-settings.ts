import { sql } from "@/lib/db";
import { MENU_CATALOG } from "@/lib/menu-catalog";

type MenuSettingsRow = {
  item_id: string;
  price: number;
  visible: boolean;
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
}

export async function getResolvedMenuSections() {
  await ensureMenuSettingsSchema();

  const rows = await sql`
    SELECT item_id, price, visible
    FROM menu_item_settings
  `;

  const settingsMap = new Map<string, { price: number; visible: boolean }>();
  for (const raw of rows as MenuSettingsRow[]) {
    const itemId = String(raw.item_id || "").trim();
    if (!itemId) continue;
    settingsMap.set(itemId, {
      price: Number(raw.price),
      visible: Boolean(raw.visible),
    });
  }

  return MENU_CATALOG.map((section) => ({
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

