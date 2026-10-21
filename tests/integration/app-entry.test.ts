// Slug-free entry links (#145): /app and /app/integrations send a signed-in user to their entry workspace
// (entryWorkspace in src/server/workspaces.ts), so Integrations opens without knowing the workspace slug. The pages'
// server logic runs here against the test DB with getCurrentUser and next/navigation's redirect stubbed; the e2e-army
// test e2e-army/145-mizano-connection-test.e2e.ts checks the real 307 on a running stack.
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import AppEntry from "@/app/app/page";
import IntegrationsEntry from "@/app/app/integrations/page";
import type { CurrentUser } from "@/server/access";
import { createWorkspace, entryWorkspace } from "@/server/workspaces";
import { closeDb, makeUser, unique } from "./helpers";

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/access", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/server/access")>()), getCurrentUser: async () => session.user }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`redirect to ${url}`), { redirectTo: url });
  },
}));

afterAll(closeDb);

/** Where the page redirected to: every path through these pages ends in redirect(). */
async function target(page: Promise<unknown>) {
  try {
    await page;
  } catch (e) {
    if (e && typeof e === "object" && "redirectTo" in e) return (e as { redirectTo: string }).redirectTo;
    throw e;
  }
  throw new Error("the page rendered instead of redirecting");
}

async function onboard(user: CurrentUser) {
  const done = { onboardingCompletedAt: new Date() };
  await db.insert(schema.userSettings).values({ userId: user.id, ...done }).onConflictDoUpdate({ target: schema.userSettings.userId, set: done });
}

describe("slug-free entry links (/app, /app/integrations)", () => {
  it("GET /app/integrations sends a signed-in member to /w/<slug>/integrations of their last-used workspace, so Integrations opens without knowing the slug", async () => {
    const user = await makeUser("entry");
    const first = await createWorkspace(user, unique("Entry A"));
    const last = await createWorkspace(user, unique("Entry B")); // createWorkspace records it as the last used
    await onboard(user);
    session.user = user;
    expect(await target(IntegrationsEntry())).toBe(`/w/${last.slug}/integrations`);
    expect(await target(AppEntry({ searchParams: Promise.resolve({}) }))).toBe(`/w/${last.slug}/flows`);

    // A last-used workspace the user has since left is skipped: their first workspace is the entry.
    await db.delete(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, last.id), eq(schema.workspaceMember.userId, user.id)));
    expect(await target(IntegrationsEntry())).toBe(`/w/${first.slug}/integrations`);
    expect((await entryWorkspace(user))?.id).toBe(first.id);
  });

  it("sends a user who has not finished onboarding, or has no workspace, to /onboarding and a signed-out caller to /sign-in", async () => {
    const fresh = await makeUser("entry-fresh");
    await createWorkspace(fresh, unique("Entry Fresh"));
    session.user = fresh;
    expect(await entryWorkspace(fresh)).toBeNull();
    expect(await target(IntegrationsEntry())).toBe("/onboarding");

    const lone = await makeUser("entry-lone");
    await onboard(lone);
    session.user = lone;
    expect(await target(IntegrationsEntry())).toBe("/onboarding");

    session.user = null;
    expect(await target(IntegrationsEntry())).toBe("/sign-in");
  });
});
