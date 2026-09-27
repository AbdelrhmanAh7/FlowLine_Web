import { z } from "zod";
import { resetFaults, setFault, testFeaturesEnabled } from "@/server/faults";
import { json, notFound, parseBody, route } from "@/server/http";

const body = z.object({
  kind: z.enum(["save", "load", "run"]).optional(),
  count: z.number().int().min(0).max(20).default(1),
  status: z.number().int().min(400).max(599).default(500),
  reset: z.boolean().optional(),
});

/** TEST ENVIRONMENT ONLY — 404 everywhere else. */
export const POST = route(async (req) => {
  if (!testFeaturesEnabled()) throw notFound();
  const b = await parseBody(req, body);
  if (b.reset) resetFaults();
  if (b.kind) setFault(b.kind, b.count, b.status);
  return json({ ok: true });
});
