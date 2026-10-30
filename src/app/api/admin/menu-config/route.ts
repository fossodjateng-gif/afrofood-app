import { requireStaffWorkstation, requireStaffOrigin, StaffAuthError } from "@/lib/staff-session-server";
import { canAccessStaffEvent } from "@/lib/staff-permissions";
import { validateAdminKitchenEvent } from "@/lib/admin-kitchen-context";
import { NextResponse } from "next/server";
import { getCatalogItemIds } from "@/lib/menu-catalog";
import { productImagePaths } from "@/lib/product-files-metadata";
import {
  createCustomMenuItem,
  deleteCustomMenuItem,
  getCustomItemIds,
  getItemAvailabilityMap,
  getPaymentConfig,
  getResolvedMenuSections,
  getStoreConfig,
  getTapToPayConfig,
  upsertItemAvailability,
  upsertMenuItemSetting,
  upsertPaymentConfig,
  upsertStoreConfig,
  upsertTapToPayConfig,
} from "@/lib/menu-settings";

export async function GET(req: Request) {
  try {
    const actor = await requireStaffWorkstation(req);
    const { searchParams } = new URL(req.url);
    const adminKitchenEvent = searchParams.has("adminEventId") ? await validateAdminKitchenEvent(actor, searchParams.get("adminEventId")) : null;
    if (adminKitchenEvent && searchParams.has("eventId") && searchParams.get("eventId") !== adminKitchenEvent.id) throw new StaffAuthError("staff_event_forbidden", 403);
    const eventId = adminKitchenEvent?.id || String(searchParams.get("eventId") || actor.cashierEventId || "").trim();
    if (actor.role !== "admin" && !canAccessStaffEvent(actor, eventId)) throw new StaffAuthError("staff_event_forbidden", 403);
    const sections = await getResolvedMenuSections(eventId || undefined);
    const images = await productImagePaths(eventId || undefined);
    for (const section of sections) {
      for (const item of section.items) item.imagePath = images.get(item.id) ?? item.imagePath;
    }
    const availability = await getItemAvailabilityMap(eventId || undefined);
    const paymentConfig = await getPaymentConfig(eventId || undefined);
    const storeConfig = await getStoreConfig();
    const tapToPayConfig = await getTapToPayConfig();
    return NextResponse.json({ ok: true, sections, availability, paymentConfig, storeConfig, tapToPayConfig, adminKitchenEvent });
  } catch (e: unknown) {
    if (e instanceof StaffAuthError) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requireStaffWorkstation(req);

    requireStaffOrigin(req);
    const staffRole = actor.role;
    const isPinAuth = false;
    const body = await req.json().catch(() => ({}));
    const setting = String(body?.setting || "").trim();
    if ((setting === "item_availability" && actor.role === "admin") || body.adminEventId !== undefined) {
      const event = await validateAdminKitchenEvent(actor, body.adminEventId);
      if (setting !== "item_availability" || body.eventId !== event.id) throw new StaffAuthError("staff_event_forbidden", 403);
    }
    if (actor.role !== "admin") {
      const eventId = body.eventId === undefined ? actor.cashierEventId : String(body.eventId);
      if (!canAccessStaffEvent(actor, eventId || "")) throw new StaffAuthError("staff_event_forbidden", 403);
      body.eventId = eventId;
    }
    if (setting === "store_config" && actor.role !== "admin") throw new StaffAuthError("admin_required", 403);

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
      const eventId = String(body?.eventId || "").trim();
      const created = await createCustomMenuItem({ category, name, description, price, eventId: eventId || undefined });
      return NextResponse.json({ ok: true, itemId: created.itemId });
    }

    if (setting === "custom_item_delete") {
      if (actor.role !== "admin") {
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
      const eventId = String(body?.eventId || "").trim();
      await upsertPaymentConfig({ cashEnabled, cardEnabled, cashlessEnabled }, eventId || undefined);
      return NextResponse.json({ ok: true });
    }

    if (setting === "item_availability") {
      if (!canManageCatalog) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      const itemId = String(body?.itemId || "").trim();
      const eventId = String(body?.eventId || "").trim();
      const status = String(body?.status || "").trim();
      const remainingQtyRaw = body?.remainingQty;
      const remainingQty =
        remainingQtyRaw === null || remainingQtyRaw === undefined || remainingQtyRaw === ""
          ? null
          : Number(remainingQtyRaw);
      const resumeAtRaw = String(body?.resumeAt || "").trim();
      if (typeof body.expectedRevision !== "string") {
        return NextResponse.json({ ok: false, error: "Reload quantities before saving" }, { status: 409 });
      }
      const revision = await upsertItemAvailability(
        itemId,
        {
          status:
            status === "limited" || status === "blocked" || status === "available"
              ? status
              : "available",
          remainingQty,
          resumeAt: resumeAtRaw || null,
        },
        eventId || undefined,
        body.expectedRevision
      );
      if (!revision) return NextResponse.json({ ok: false, error: "Quantities changed. Reload before saving / Mengen geaendert: bitte neu laden." }, { status: 409 });
      return NextResponse.json({ ok: true, revision });
    }

    if (setting === "store_config") {
      if (!canManageOps) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      const activeEventId = String(body?.activeEventId || "").trim();
      const activeEventName = String(body?.activeEventName || "").trim();
      const events = Array.isArray(body?.events)
        ? body.events
            .map((event: { id?: string; name?: string; preorderEnabled?: boolean }) => ({
              id: String(event?.id || "").trim(),
              name: String(event?.name || "").trim(),
              preorderEnabled: event?.preorderEnabled === true,
            }))
            .filter((event: { id: string; name: string; preorderEnabled?: boolean }) => event.id && event.name)
        : [];
      await upsertStoreConfig({ activeEventId, activeEventName, events });
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
    const eventId = String(body?.eventId || "").trim();
    if (!canManageCatalog) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const validIds = new Set([...getCatalogItemIds(), ...(await getCustomItemIds())]);
    if (!validIds.has(itemId)) {
      return NextResponse.json({ ok: false, error: "Unknown itemId" }, { status: 400 });
    }

    await upsertMenuItemSetting({ itemId, price, visible, eventId: eventId || undefined });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof StaffAuthError) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
