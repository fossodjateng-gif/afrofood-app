export async function loadAdminKitchenEvent(adminEventId: string) {
  const response = await fetch(`/api/admin/menu-config?adminEventId=${encodeURIComponent(adminEventId)}`, { cache: "no-store" });
  const data = await response.json();
  const event = data?.adminKitchenEvent;
  if (!response.ok || !data?.ok || event?.id !== adminEventId || typeof event.name !== "string") {
    throw new Error(data?.error || "admin_kitchen_context_unavailable");
  }
  return event as { id: string; name: string };
}
