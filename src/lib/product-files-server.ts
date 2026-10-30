import { randomUUID } from "node:crypto";
import { put, del } from "@vercel/blob";
import { sql } from "@/lib/db";
import { requireStaffAdmin } from "@/lib/staff-admin-server";
import { staffSessionHash, StaffAuthError } from "@/lib/staff-session-server";
import { productFileKey, readProductFile, requireProduct } from "@/lib/product-files-metadata";
import { validateProductFile } from "@/lib/product-file-validation";
import type { ProductFileAsset, ProductFileKind } from "@/lib/product-files";

// A failed/uncertain DB response must never cause deletion of a referenced blob.
async function deleteUnreferenced(pathname: string) {
  try {
    const references = await sql`SELECT setting_key FROM app_settings WHERE setting_key LIKE 'product-files:%'
      AND setting_value->>'pathname' = ${pathname} LIMIT 1`;
    if (references.length) return true;
    await del(pathname);
    return true;
  } catch { return false; }
}

export async function mutateProductFile(req: Request, id: string, kind: ProductFileKind, expectedVersion: unknown, file?: File) {
  const admin = await requireStaffAdmin(req, true);
  await requireProduct(id);
  const previous = await readProductFile(id, kind);
  if (expectedVersion !== (previous?.version ?? null)) throw new StaffAuthError("product_file_changed", 409);
  let next: ProductFileAsset | null = null;
  if (file) {
    const validated = await validateProductFile(file, kind);
    const version = randomUUID();
    const pathname = `product-files/${id}/${version}.${validated.extension}`;
    // Use only a server-generated path; never a client filename or URL.
    try {
      await put(pathname, validated.bytes, { access: "private", addRandomSuffix: false, contentType: validated.contentType });
    } catch {
      await deleteUnreferenced(pathname);
      throw new StaffAuthError("product_file_storage_unavailable", 503);
    }
    next = { pathname, version, contentType: validated.contentType, size: validated.bytes.length };
  }
  try {
    const result = await sql.transaction([
      sql`SELECT af_assert_staff_admin(${staffSessionHash(req)}, ${admin.id})`,
      sql`INSERT INTO app_settings (setting_key, setting_value, updated_at)
        SELECT ${productFileKey(id, kind)}, ${JSON.stringify(next)}::jsonb, NOW()
        WHERE ${previous === null} OR EXISTS (SELECT 1 FROM app_settings WHERE setting_key = ${productFileKey(id, kind)})
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
        WHERE app_settings.setting_value IS NOT DISTINCT FROM ${JSON.stringify(previous)}::jsonb
        RETURNING setting_key`,
    ], { isolationLevel: "Serializable" });
    if (!result[1].length) throw new StaffAuthError("product_file_changed", 409);
  } catch (error) {
    if (next) await deleteUnreferenced(next.pathname);
    if (error instanceof StaffAuthError) throw error;
    throw new StaffAuthError("product_file_save_unconfirmed", 503);
  }
  const cleanupPending = previous ? !await deleteUnreferenced(previous.pathname) : false;
  return { asset: next, cleanupPending };
}
