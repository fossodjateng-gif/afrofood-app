import { NextResponse } from "next/server";
import { getPaymentConfig, getResolvedMenuSections, getStoreConfig, getTapToPayConfig } from "@/lib/menu-settings";

export async function GET() {
  try {
    const sections = await getResolvedMenuSections();
    const paymentConfig = await getPaymentConfig();
    const storeConfig = await getStoreConfig();
    const tapToPayConfig = await getTapToPayConfig();
    const visibleSections = sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.visible),
      }))
      .filter((section) => section.items.length > 0);

    return NextResponse.json({ ok: true, sections: visibleSections, paymentConfig, storeConfig, tapToPayConfig });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
