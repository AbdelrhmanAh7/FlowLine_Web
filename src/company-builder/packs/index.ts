import { contentBriefPack } from "./content-brief";
import { customerFollowUpPack } from "./customer-follow-up";
import { customerTriagePack } from "./customer-triage";
import { invoiceOrganiserPack } from "./invoice-organiser";
import { leadQualificationPack } from "./lead-qualification";
import { operationsSummaryPack } from "./operations-summary";
import type { TaskPack } from "./types";

export type { PackCheck, PackFixture, PackParams, TaskPack } from "./types";

/**
 * Registered, versioned packs. A blueprint may only reference these (id + version); nothing else compiles.
 * customer-triage v1 stays registered so blueprints installed before the follow-up pack keep validating.
 */
export const PACKS: readonly TaskPack[] = [customerFollowUpPack, customerTriagePack, invoiceOrganiserPack, operationsSummaryPack, leadQualificationPack, contentBriefPack];

export function getPack(id: string | null, version: number | null): TaskPack | null {
  return PACKS.find((p) => p.id === id && p.version === version) ?? null;
}
