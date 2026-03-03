import { NextResponse } from "next/server";
import { getCatalogItemIds } from "@/lib/menu-catalog";
import { getResolvedMenuSections, upsertMenuItemSetting } from "@/lib/menu-settings";

function getAdminPin() {
  return process.env.ADMIN_MENU_PIN || process.env.NEXT_PUBLIC_CAISSE_PIN || "1955";
}

function isAuthorized(req: Request) {
  const provided = String(req.headers.get("x-admin-pin") || "").trim();
  return Boolean(provided) && provided === getAdminPin();
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const sections = await getResolvedMenuSections();
    return NextResponse.json({ ok: true, sections });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const itemId = String(body?.itemId || "").trim();
    const price = Number(body?.price);
    const visible = Boolean(body?.visible);

    const validIds = new Set(getCatalogItemIds());
    if (!validIds.has(itemId)) {
      return NextResponse.json({ ok: false, error: "Unknown itemId" }, { status: 400 });
    }

    await upsertMenuItemSetting({ itemId, price, visible });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

