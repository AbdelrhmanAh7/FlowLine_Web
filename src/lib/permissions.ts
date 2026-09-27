/** Mirrors the workspace_role enum in src/db/schema.ts (kept local so client code never imports the schema). */
export type Role = "owner" | "editor" | "viewer";

/**
 * The workspace permission matrix: the single source of truth for who may do what.
 * Every API route checks a capability through `src/server/access.ts`; the UI reads the same
 * matrix only to explain disabled controls (hiding a button is never the enforcement).
 */
export const CAPABILITIES = {
  "flow.view": ["owner", "editor", "viewer"],
  "flow.edit": ["owner", "editor"],
  "flow.run": ["owner", "editor"],
  "flow.publish": ["owner", "editor"],
  "flow.share": ["owner", "editor"],
  "flow.delete": ["owner", "editor"],
  "approval.decide": ["owner", "editor"],
  "integration.use": ["owner", "editor"],
  "integration.manage": ["owner", "editor"],
  "knowledge.view": ["owner", "editor", "viewer"],
  "knowledge.manage": ["owner", "editor"],
  "agent.view": ["owner", "editor", "viewer"],
  "agent.edit": ["owner", "editor"],
  "agent.run": ["owner", "editor"],
  "usage.view": ["owner", "editor", "viewer"],
  "member.view": ["owner", "editor", "viewer"],
  "member.manage": ["owner"],
  "apikey.manage": ["owner"],
  "billing.view": ["owner", "editor"],
  "billing.manage": ["owner"],
  "audit.view": ["owner"],
  "workspace.settings": ["owner"],
  "sso.manage": ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];

export function can(role: Role | null | undefined, capability: Capability): boolean {
  return role != null && (CAPABILITIES[capability] as readonly Role[]).includes(role);
}

export function isCapability(x: string): x is Capability {
  return x in CAPABILITIES;
}

/** Human-readable reason for a refused capability (used in 403 messages and disabled-control tooltips). */
export function denyReason(role: Role | null | undefined, capability: Capability): string {
  const allowed = CAPABILITIES[capability] as readonly Role[];
  const plural = allowed.map((r) => `${r}s`);
  const who = plural.length === 1 ? plural[0] : `${plural.slice(0, -1).join(", ")} and ${plural.at(-1)}`;
  return `Only workspace ${who} can do this${role ? `; you are ${/^[aeiou]/.test(role) ? "an" : "a"} ${role}` : ""}`;
}
