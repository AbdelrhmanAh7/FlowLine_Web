import type { ActionDef, ProviderDef, ProviderId } from "./types";

// Provider modules register here (one file per provider in ./providers).
const PROVIDERS: ProviderDef[] = [];

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
