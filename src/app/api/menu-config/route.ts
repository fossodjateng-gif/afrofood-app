import { NextResponse } from "next/server";
import { getResolvedMenuSections } from "@/lib/menu-settings";

export async function GET() {
  try {
    const sections = await getResolvedMenuSections();
    const visibleSections = sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.visible),
      }))
      .filter((section) => section.items.length > 0);

    return NextResponse.json({ ok: true, sections: visibleSections });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

