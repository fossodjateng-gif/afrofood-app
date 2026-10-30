import { sql } from "@/lib/db";
import { getCatalogItemIds } from "@/lib/menu-catalog";
import { StaffAuthError } from "@/lib/staff-session-server";
import { MAX_PRODUCT_FILE_BYTES, productFileUrl, type ProductFileAsset, type ProductFileKind } from "@/lib/product-files";

export function productFileKey(id: string, kind: ProductFileKind) { return `product-files:${id}:${kind}`; }
export async function requireProduct(id: string) {
  if (!id || id.length > 160 || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new StaffAuthError("invalid_product", 400);
  if (getCatalogItemIds().includes(id)) return;
  const rows = await sql`SELECT item_id FROM custom_menu_items WHERE item_id = ${id} LIMIT 1`;
  if (!rows.length) throw new StaffAuthError("product_not_found", 404);
}
export function parseProductFile(value: unknown): ProductFileAsset | null {
  if (value == null) return null;
  const a = value as ProductFileAsset;
  if (typeof a.pathname !== "string" || !/^product-files\/[a-zA-Z0-9_-]+\/[a-f0-9-]{36}\.(webp|pdf)$/.test(a.pathname)
    || typeof a.version !== "string" || !/^[a-f0-9-]{36}$/.test(a.version)
    || !["image/webp", "application/pdf"].includes(a.contentType) || !Number.isSafeInteger(a.size) || a.size < 1 || a.size > MAX_PRODUCT_FILE_BYTES
    || !a.pathname.endsWith(`/${a.version}.${a.contentType === "image/webp" ? "webp" : "pdf"}`)) {
    throw new StaffAuthError("product_file_metadata_invalid", 503);
  }
  return { pathname: a.pathname, version: a.version, contentType: a.contentType, size: a.size };
}
export async function readProductFile(id: string, kind: ProductFileKind) {
  const rows = await sql`SELECT setting_value FROM app_settings WHERE setting_key = ${productFileKey(id, kind)} LIMIT 1`;
  const asset = parseProductFile(rows[0]?.setting_value);
  if (asset && (!asset.pathname.startsWith(`product-files/${id}/`) || asset.contentType !== (kind === "image" ? "image/webp" : "application/pdf"))) {
    throw new StaffAuthError("product_file_metadata_invalid", 503);
  }
  return asset;
}
export async function productImagePaths(eventId?: string) {
  const rows = await sql`SELECT setting_key, setting_value FROM app_settings WHERE setting_key LIKE 'product-files:%:image'`;
  const paths = new Map<string, string>();
  for (const row of rows) {
    const asset = parseProductFile(row.setting_value);
    if (!asset) continue;
    const id = String(row.setting_key).slice("product-files:".length, -":image".length);
    if (asset.contentType !== "image/webp" || !asset.pathname.startsWith(`product-files/${id}/`)) throw new StaffAuthError("product_file_metadata_invalid", 503);
    const url = productFileUrl(id, "image", asset.version);
    paths.set(id, eventId ? `${url}&eventId=${encodeURIComponent(eventId)}` : url);
  }
  return paths;
}
