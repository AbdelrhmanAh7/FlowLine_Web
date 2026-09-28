import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/** Product events for the private beta funnel (P4-15). Adding a name is deliberate: this list is the contract. */
export const PRODUCT_EVENTS = [
  "signup_completed",
  "onboarding_completed",
  "workflow_created",
  "template_used",
  "run_finished",
  "integration_connected",
  "agent_created",
  "copilot_requested",
  "copilot_decided",
  "billing_test_event",
  "api_error",
] as const;
export type ProductEvent = (typeof PRODUCT_EVENTS)[number];

/** Only these property keys are stored, and only scalar values — so no payload or secret can slip in. */
const ALLOWED_PROPS = new Set(["status", "code", "provider", "via", "templateId", "trigger", "decision", "valid", "attempts", "kind", "httpStatus", "goal", "event", "mode"]);

const store = new AsyncLocalStorage<{ requestId: string }>();

/** Runs `fn` with a correlation id (from X-Request-Id when it looks sane, else a new one). */
export function withRequestContext<T>(requestId: string | null, fn: () => Promise<T>): Promise<T> {
  const id = requestId && /^[A-Za-z0-9-]{8,64}$/.test(requestId) ? requestId : randomUUID();
  return store.run({ requestId: id }, fn);
}
export function correlationId() {
  return store.getStore()?.requestId ?? null;
}

export function cleanProps(props: Record<string, unknown> = {}) {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED_PROPS.has(k)) continue;
    if (v === null || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 80);
  }
  return out;
}

/** Best effort: telemetry never breaks or slows a user action (a failed insert is only logged). */
export function track(name: ProductEvent, where: { workspaceId?: string | null; userId?: string | null } = {}, props?: Record<string, unknown>) {
  if (process.env.FLOWLINE_TELEMETRY === "off") return;
  const row = { name, workspaceId: where.workspaceId ?? null, userId: where.userId ?? null, props: cleanProps(props), correlationId: correlationId() };
  // The DB module is loaded lazily so modules that record events (e.g. http.ts) stay importable without a database.
  void import("@/db")
    .then(({ db, schema }) => db.insert(schema.productEvent).values(row))
    .catch(() => console.warn("[telemetry] event not recorded:", name));
}
