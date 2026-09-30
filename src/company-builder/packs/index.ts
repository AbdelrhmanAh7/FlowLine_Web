import { contentBriefPack } from "./content-brief";
import { customerTriagePack } from "./customer-triage";
import { invoiceOrganiserPack } from "./invoice-organiser";
import type { TaskPack } from "./types";

export type { PackCheck, PackFixture, PackParams, TaskPack } from "./types";

/** Registered, versioned packs. A blueprint may only reference these (id + version); nothing else compiles. */
export const PACKS: readonly TaskPack[] = [customerTriagePack, invoiceOrganiserPack, contentBriefPack];

export function getPack(id: string | null, version: number | null): TaskPack | null {
  return PACKS.find((p) => p.id === id && p.version === version) ?? null;
}
