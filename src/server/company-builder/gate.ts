import type { CurrentUser } from "@/server/access";
import { HttpError, notFound } from "@/server/http";

/**
 * Company Builder gates.
 *
 * 1. Feature gate: `FLOWLINE_COMPANY_BUILDER=on`. Off by default, so release scope is unchanged until the owner enables
 *    it. When off, every Company Builder route answers 404 and the nav item is hidden.
 * 2. OWNER_CLI_PROTOTYPE gate (brief §4): ALL of
 *    - `FLOWLINE_CB_PROTOTYPE=owner_cli` in a development/test build (never with FLOWLINE_BETA_MODE or in staging/prod),
 *    - the server-verified session user id equals `FLOWLINE_CB_FOUNDER_USER_ID` (not a role, not a client flag),
 *    - the workspace id equals `FLOWLINE_CB_PROTOTYPE_WORKSPACE_ID`,
 *    - the request arrived on a loopback host (or an explicitly approved private host) with no proxy forwarding.
 *    Paying, accepting an invitation or being a workspace Owner never satisfies it.
 */

export function companyBuilderEnabled(): boolean {
  return process.env.FLOWLINE_COMPANY_BUILDER === "on";
}

export function assertCompanyBuilderEnabled() {
  if (!companyBuilderEnabled()) throw notFound("Not found");
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Why the prototype is unavailable (null = available). Reasons are stable codes shown to the founder only. */
export function prototypeConfigProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.FLOWLINE_CB_PROTOTYPE !== "owner_cli") return "PROTOTYPE_DISABLED";
  const flEnv = env.FLOWLINE_ENV ?? "development";
  if (flEnv !== "development" && flEnv !== "test") return "PROTOTYPE_NOT_ALLOWED_IN_THIS_BUILD";
  if (env.FLOWLINE_BETA_MODE) return "PROTOTYPE_NOT_ALLOWED_IN_BETA";
  if (!env.FLOWLINE_CB_FOUNDER_USER_ID || !env.FLOWLINE_CB_PROTOTYPE_WORKSPACE_ID) return "PROTOTYPE_IDENTITY_NOT_CONFIGURED";
  // Host / X-Forwarded-For headers are client-controlled, so the header check below is only defence in depth: the
  // network boundary is the server's BIND address. scripts/company-builder/start-private.mjs binds Next to 127.0.0.1
  // (or one approved private address) and sets this marker; a server started any other way never enables the prototype.
  if (env.FLOWLINE_CB_BOUND !== "loopback" && env.FLOWLINE_CB_BOUND !== "private") return "PROTOTYPE_NOT_PRIVATELY_BOUND";
  return null;
}

function hostOf(req: Request): string {
  const host = req.headers.get("host") ?? new URL(req.url).host;
  // Strip the port (IPv6 literals keep their brackets).
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]!;
}

export function isPrivateRequest(req: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  // A proxy/tunnel relaying a non-loopback client means the request is not a private loopback call. (The Next server
  // itself may add x-forwarded-for with the loopback peer address; only loopback entries are accepted.)
  const relayed = [req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip")]
    .filter((v): v is string => Boolean(v))
    .flatMap((v) => v.split(","))
    .map((v) => v.trim().replace(/^::ffff:/, ""));
  if (req.headers.get("forwarded")) return false;
  const list = (v: string | undefined) => (v ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const host = hostOf(req).toLowerCase();
  if (LOOPBACK.has(host)) return relayed.every((ip) => ip === "127.0.0.1" || ip === "::1");
  // A LAN host is only possible when the operator deliberately bound the server to an approved private address.
  if (env.FLOWLINE_CB_BOUND !== "private") return false;
  // An explicitly approved private host (e.g. the Pi on the LAN) also needs explicitly approved client addresses.
  if (!list(env.FLOWLINE_CB_PRIVATE_HOSTS).includes(host)) return false;
  const clients = list(env.FLOWLINE_CB_PRIVATE_CLIENTS);
  return relayed.length > 0 && relayed.every((ip) => clients.includes(ip));
}

export interface PrototypeAccess {
  allowed: boolean;
  /** Only returned to the founder; everyone else just gets `allowed: false`. */
  reason: string | null;
}

export function prototypeAccess(user: CurrentUser, workspaceId: string, req: Request, env: NodeJS.ProcessEnv = process.env): PrototypeAccess {
  const problem = prototypeConfigProblem(env);
  const isFounder = Boolean(env.FLOWLINE_CB_FOUNDER_USER_ID) && user.id === env.FLOWLINE_CB_FOUNDER_USER_ID;
  if (!isFounder) return { allowed: false, reason: null };
  if (problem) return { allowed: false, reason: problem };
  if (workspaceId !== env.FLOWLINE_CB_PROTOTYPE_WORKSPACE_ID) return { allowed: false, reason: "NOT_PROTOTYPE_WORKSPACE" };
  if (!isPrivateRequest(req, env)) return { allowed: false, reason: "NOT_PRIVATE_HOST" };
  return { allowed: true, reason: null };
}

/** Everyone who isn't the founder in the designated workspace on a private host gets the same 404. */
export function assertPrototypeAccess(user: CurrentUser, workspaceId: string, req: Request) {
  const a = prototypeAccess(user, workspaceId, req);
  if (!a.allowed) {
    if (a.reason) throw new HttpError(403, "PROTOTYPE_UNAVAILABLE", a.reason);
    throw notFound("Not found");
  }
}
