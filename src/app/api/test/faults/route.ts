import { z } from "zod";
import { resetFaults, setFault, testFeaturesEnabled } from "@/server/faults";
import { requireUser } from "@/server/access";
import { json, notFound, parseBody, route } from "@/server/http";

const body = z.object({
  kind: z.enum(["save", "load", "run", "cb_action_lost"]).optional(),
  count: z.number().int().min(0).max(20).default(1),
  status: z.number().int().min(400).max(599).default(500),
  reset: z.boolean().optional(),
});

/** TEST ENVIRONMENT ONLY — 404 everywhere else. */
export const POST = route(async (req) => {
  if (!testFeaturesEnabled()) throw notFound();
  const user = await requireUser(); // faults only ever affect the caller's own requests
  const b = await parseBody(req, body);
  if (b.reset) resetFaults(user.id);
  if (b.kind) setFault(user.id, b.kind, b.count, b.status);
  return json({ ok: true });
});
