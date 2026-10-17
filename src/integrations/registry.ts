import type { ActionDef, ProviderDef, ProviderId } from "./types";
import googleSheets from "./providers/google_sheets";
import gmail from "./providers/gmail";
import slack from "./providers/slack";
import hubspot from "./providers/hubspot";
import zendesk from "./providers/zendesk";
import airtable from "./providers/airtable";
import snowflake from "./providers/snowflake";
import github from "./providers/github";
import stripe from "./providers/stripe";
import notion from "./providers/notion";
import postgres from "./providers/postgres";
import linear from "./providers/linear";
import mizano from "./providers/mizano";

const PROVIDERS: ProviderDef[] = [googleSheets, gmail, slack, hubspot, zendesk, airtable, snowflake, github, stripe, notion, postgres, linear, mizano];

/** Registered but not offered yet: Mizano stays out of the catalog until its connection type and live proof ship (#252). */
const PRE_GA = new Set<string>(["mizano"]);

/** The integration catalog: every supported provider, in order. Pre-GA providers are left out (see `allProviders`). */
export function listProviders(): ProviderDef[] {
  return PROVIDERS.filter((p) => !PRE_GA.has(p.id));
}

/** Every registered provider, pre-GA ones included, for lookups of already-saved steps and connections by id. */
export function allProviders(): ProviderDef[] {
  return PROVIDERS;
}

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function getAction(actionId: string): { provider: ProviderDef; action: ActionDef } | undefined {
  for (const provider of PROVIDERS) {
    const action = provider.actions.find((a) => a.id === actionId);
    if (action) return { provider, action };
  }
  return undefined;
}

export type { ProviderId };
