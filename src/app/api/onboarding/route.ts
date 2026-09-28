import { z } from "zod";
import { track } from "@/server/telemetry";
import { db, schema } from "@/db";
import { requireUser } from "@/server/access";
import { json, parseBody, route } from "@/server/http";

const body = z.object({
  goal: z.enum(["sales", "support", "data", "engineering"]).nullable().optional(),
  skipped: z.boolean().default(false),
});

/** Marks onboarding finished (or skipped) and records the chosen goal. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { goal, skipped } = await parseBody(req, body);
  const completedAt = new Date();
  await db
    .insert(schema.userSettings)
    .values({ userId: user.id, onboardingGoal: goal ?? null, onboardingSkipped: skipped, onboardingCompletedAt: completedAt })
    .onConflictDoUpdate({
      target: schema.userSettings.userId,
      set: { onboardingGoal: goal ?? null, onboardingSkipped: skipped, onboardingCompletedAt: completedAt },
    });
  track("onboarding_completed", { userId: user.id }, { goal: goal ?? null, status: skipped ? "skipped" : "completed" });
  return json({ ok: true });
});
