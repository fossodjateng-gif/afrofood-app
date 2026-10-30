import { NextResponse } from "next/server";
import { requireStaffAdmin } from "@/lib/staff-admin-server";
import { MENU_CATALOG, getMenuItemImagePath } from "@/lib/menu-catalog";
import { StaffAuthError } from "@/lib/staff-session-server";
import { readProductFile, requireProduct } from "@/lib/product-files-metadata";
import { mutateProductFile } from "@/lib/product-files-server";
import { MAX_PRODUCT_FILE_BYTES, productFileUrl, type ProductFileAsset, type ProductFileKind } from "@/lib/product-files";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const present = (id: string, kind: ProductFileKind, asset: ProductFileAsset | null) => asset
  ? { version: asset.version, contentType: asset.contentType, size: asset.size, url: productFileUrl(id, kind, asset.version) } : null;
function failure(error: unknown) {
  return NextResponse.json({ ok: false, error: error instanceof StaffAuthError ? error.code : "product_files_unavailable" }, {
    status: error instanceof StaffAuthError ? error.status : 503, headers,
  });
}
async function boundedBody(req: Request, limit: number) {
  if (Number(req.headers.get("content-length")) > limit) throw new StaffAuthError("product_file_size", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new StaffAuthError("product_file_invalid", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > limit) { await reader.cancel(); throw new StaffAuthError("product_file_size", 413); }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks);
}
export async function GET(req: Request) {
  try {
    await requireStaffAdmin(req);
    const id = new URL(req.url).searchParams.get("productId") || "";
    await requireProduct(id);
    const [image, pdf] = await Promise.all([readProductFile(id, "image"), readProductFile(id, "pdf")]);
    const fallbackImageUrl = MENU_CATALOG.flatMap(section => section.items).find(item => item.id === id)?.imagePath ?? getMenuItemImagePath(id);
    return NextResponse.json({ ok: true, image: present(id, "image", image), pdf: present(id, "pdf", pdf), fallbackImageUrl }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    await requireStaffAdmin(req, true);
    // Bound the request even when Content-Length is absent or forged.
    const bytes = await boundedBody(req, MAX_PRODUCT_FILE_BYTES + 64_000);
    const form = await new Response(bytes, { headers: { "Content-Type": req.headers.get("content-type") || "" } }).formData()
      .catch(() => { throw new StaffAuthError("product_file_invalid", 400); });
    const id = String(form.get("productId") || ""), kind = form.get("kind"), file = form.get("file");
    if ((kind !== "image" && kind !== "pdf") || !(file instanceof File)) throw new StaffAuthError("product_file_invalid", 400);
    const result = await mutateProductFile(req, id, kind, form.get("expectedVersion") || null, file);
    return NextResponse.json({ ok: true, kind, asset: present(id, kind, result.asset), cleanupPending: result.cleanupPending }, { headers });
  } catch (error) { return failure(error); }
}
export async function DELETE(req: Request) {
  try {
    await requireStaffAdmin(req, true);
    const bytes = await boundedBody(req, 4096);
    let body;
    try { body = JSON.parse(bytes.toString("utf8")); }
    catch { throw new StaffAuthError("product_file_invalid", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new StaffAuthError("product_file_invalid", 400);
    if (body.kind !== "image" && body.kind !== "pdf") throw new StaffAuthError("product_file_invalid", 400);
    const result = await mutateProductFile(req, String(body.productId || ""), body.kind, body.expectedVersion);
    return NextResponse.json({ ok: true, kind: body.kind, asset: null, cleanupPending: result.cleanupPending }, { headers });
  } catch (error) { return failure(error); }
}
