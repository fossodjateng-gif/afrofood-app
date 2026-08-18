import { NextResponse } from "next/server";
import { getCatalogItemIds } from "@/lib/menu-catalog";
import {
  createCustomMenuItem,
  deleteCustomMenuItem,
  getCustomItemIds,
  getPaymentConfig,
  getResolvedMenuSections,
  getStoreConfig,
  getTapToPayConfig,
  upsertMenuItemSetting,
  upsertPaymentConfig,
  upsertStoreConfig,
  upsertTapToPayConfig,
} from "@/lib/menu-settings";

function getAdminPin() {
  return process.env.ADMIN_MENU_PIN || process.env.NEXT_PUBLIC_CAISSE_PIN || "1955";
}

function getStaffRole(req: Request) {
  return String(req.headers.get("x-staff-role") || "").trim().toLowerCase();
}

function isAuthorized(req: Request) {
  const provided = String(req.headers.get("x-admin-pin") || "").trim();
  if (Boolean(provided) && provided === getAdminPin()) return true;
  const staffRole = getStaffRole(req);
  return staffRole === "admin" || staffRole === "kitchen" || staffRole === "cashier";
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const sections = await getResolvedMenuSections();
    const paymentConfig = await getPaymentConfig();
    const storeConfig = await getStoreConfig();
    const tapToPayConfig = await getTapToPayConfig();
    return NextResponse.json({ ok: true, sections, paymentConfig, storeConfig, tapToPayConfig });
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

    const staffRole = getStaffRole(req);
    const isPinAuth = Boolean(String(req.headers.get("x-admin-pin") || "").trim());
    const body = await req.json().catch(() => ({}));
    const setting = String(body?.setting || "").trim();

    const canManageCatalog = isPinAuth || staffRole === "admin" || staffRole === "kitchen" || staffRole === "cashier";
    const canManageOps = isPinAuth || staffRole === "admin" || staffRole === "cashier";

    if (setting === "custom_item_create") {
      if (!canManageCatalog) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      const category = String(body?.category || "").trim() as "dish" | "drink" | "dip";
      const name = String(body?.name || "").trim();
      const description = String(body?.description || "").trim();
      const price = Number(body?.price);
      const created = await createCustomMenuItem({ category, name, description, price });
      return NextResponse.json({ ok: true, itemId: created.itemId });
    }

    if (setting === "custom_item_delete") {
      if (!canManageCatalog) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      const itemId = String(body?.itemId || "").trim();
      await deleteCustomMenuItem(itemId);
      return NextResponse.json({ ok: true });
    }

    if (setting === "payment_config") {
      if (!canManageOps) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      const cashEnabled = Boolean(body?.cashEnabled);
      const cardEnabled = Boolean(body?.cardEnabled);
      const cashlessEnabled = body?.cashlessEnabled === undefined ? true : Boolean(body?.cashlessEnabled);
      await upsertPaymentConfig({ cashEnabled, cardEnabled, cashlessEnabled });
      return NextResponse.json({ ok: true });
    }

    if (setting === "store_config") {
      if (!canManageOps) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      const activeEventName = String(body?.activeEventName || "").trim();
      await upsertStoreConfig({ activeEventName });
      return NextResponse.json({ ok: true });
    }

    if (setting === "tap_to_pay_config") {
      if (!canManageOps) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      const awarenessSeen = body?.awarenessSeen === undefined ? undefined : Boolean(body?.awarenessSeen);
      const termsViewed = body?.termsViewed === undefined ? undefined : Boolean(body?.termsViewed);
      const termsAccepted = body?.termsAccepted === undefined ? undefined : Boolean(body?.termsAccepted);
      const educationSeen = body?.educationSeen === undefined ? undefined : Boolean(body?.educationSeen);
      const readinessStatusRaw = String(body?.readinessStatus || "").trim();
      const readinessStatus =
        readinessStatusRaw === "not_prepared" || readinessStatusRaw === "preparing" || readinessStatusRaw === "ready"
          ? readinessStatusRaw
          : undefined;
      await upsertTapToPayConfig({
        awarenessSeen,
        termsViewed,
        termsAccepted,
        educationSeen,
        readinessStatus,
      });
      return NextResponse.json({ ok: true });
    }

    const itemId = String(body?.itemId || "").trim();
    const price = Number(body?.price);
    const visible = Boolean(body?.visible);
    if (!canManageCatalog) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const validIds = new Set([...getCatalogItemIds(), ...(await getCustomItemIds())]);
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
