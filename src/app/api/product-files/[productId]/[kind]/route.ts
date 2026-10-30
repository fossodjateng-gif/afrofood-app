import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireStaffSession, requireStaffWorkstation, StaffAuthError } from "@/lib/staff-session-server";
import { readProductFile, requireProduct } from "@/lib/product-files-metadata";

export const runtime = "nodejs";
export async function GET(req: Request, context: { params: Promise<{ productId: string; kind: string }> }) {
  try {
    const actor = await requireStaffSession(req);
    const { productId, kind } = await context.params;
    if (kind !== "image" && kind !== "pdf") throw new StaffAuthError("product_file_invalid", 400);
    if (kind === "pdf" && actor.role !== "admin") throw new StaffAuthError("admin_required", 403);
    if (actor.role !== "admin") {
      const assigned = await requireStaffWorkstation(req);
      const eventId = new URL(req.url).searchParams.get("eventId") || assigned.cashierEventId;
      if (!assigned.cashierEventId || assigned.cashierEventId !== eventId) throw new StaffAuthError("staff_event_forbidden", 403);
    }
    await requireProduct(productId);
    const asset = await readProductFile(productId, kind);
    const version = new URL(req.url).searchParams.get("v");
    if (!asset || (version && version !== asset.version)) throw new StaffAuthError("product_file_not_found", 404);
    const result = await get(asset.pathname, { access: "private" });
    if (!result || result.statusCode !== 200) throw new StaffAuthError("product_file_not_found", 404);
    return new Response(result.stream, { headers: { "Content-Type": asset.contentType, "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="product.${kind === "image" ? "webp" : "pdf"}"`, "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof StaffAuthError ? error.code : "product_file_unavailable" }, {
      status: error instanceof StaffAuthError ? error.status : 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
