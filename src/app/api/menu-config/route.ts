import { NextResponse } from "next/server";
import { getPaymentConfig, getResolvedMenuSections, getStoreConfig, getTapToPayConfig } from "@/lib/menu-settings";

export async function GET(req: Request) {
  try {
    const storeConfig = await getStoreConfig();
    const { searchParams } = new URL(req.url);
    const eventIdRaw = String(searchParams.get("eventId") || "").trim();
    const selectedEvent =
      (eventIdRaw && storeConfig.events.find((event) => event.id === eventIdRaw)) ||
      (storeConfig.activeEventId && storeConfig.events.find((event) => event.id === storeConfig.activeEventId)) ||
      null;
    const sections = await getResolvedMenuSections(selectedEvent?.id);
    const paymentConfig = await getPaymentConfig(selectedEvent?.id);
    const tapToPayConfig = await getTapToPayConfig();
    const visibleSections = sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.visible),
      }))
      .filter((section) => section.items.length > 0);

    return NextResponse.json({
      ok: true,
      sections: visibleSections,
      paymentConfig,
      storeConfig,
      tapToPayConfig,
      selectedEvent,
    });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
