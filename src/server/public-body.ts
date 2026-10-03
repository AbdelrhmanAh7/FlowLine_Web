import { isIP } from "node:net";
import { capBody, HttpError } from "./http";
import { checkRate } from "./rate-limit";

export const PUBLIC_JSON_MAX_BYTES = 16 * 1024;
export const AUTH_BODY_MAX_BYTES = 64 * 1024;

/** X-Real-IP is overwritten by the beta proxy. Never accept client X-Forwarded-For here. */
export async function admitPublicBody(req: Request, kind: "auth" | "email" | "beta") {
  const ip = req.headers.get("x-real-ip");
  // Without the trusted proxy header, byte caps still apply. Runtime admission depends on the approved proxy.
  if (!ip || !isIP(ip)) return;
  if (process.env.FLOWLINE_ENV === "test" && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) return;
  if (!(await checkRate(`public-body:${kind}:${ip}`, 60, 60)))
    throw new HttpError(429, "RATE_LIMITED", "Too many requests. Try again shortly.");
}

/** Cap every auth POST before request cloning or Better Auth's own JSON/form parser. */
export async function capAuthBody(req: Request) {
  const tooLarge = new HttpError(413, "BODY_TOO_LARGE", "Request body is too large");
  if (Number(req.headers.get("content-length") ?? 0) > AUTH_BODY_MAX_BYTES) throw tooLarge;
  await admitPublicBody(req, "auth");
  return capBody(req, AUTH_BODY_MAX_BYTES, tooLarge);
}
