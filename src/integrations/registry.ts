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

const PROVIDERS: ProviderDef[] = [googleSheets, gmail, slack, hubspot, zendesk, airtable, snowflake, github, stripe, notion, postgres, linear];

export function listProviders(): ProviderDef[] {
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
