export type WorkstationType = "cashier" | "kitchen";
export type Workstation = { id: string; name: string; type: WorkstationType; active: boolean };
export type WorkstationConfig = { cashier: Workstation[]; kitchen: Workstation[] };
export const WORKSTATION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function parseWorkstations(value: unknown): WorkstationConfig {
  const raw = value as Partial<WorkstationConfig> | null;
  return { cashier: Array.isArray(raw?.cashier) ? raw.cashier : [], kitchen: Array.isArray(raw?.kitchen) ? raw.kitchen : [] };
}
export function findWorkstation(config: WorkstationConfig, id: string) {
  return [...config.cashier, ...config.kitchen].find(station => station.id === id);
}
