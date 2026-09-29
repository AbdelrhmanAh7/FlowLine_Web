import { requireUser, requireWorkspace } from "@/server/access";
import { json, route } from "@/server/http";
import { describeAuthorizationApp } from "@/server/oauth-apps";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ wid: string }> };

/**
 * Consent provenance, shown to a member BEFORE the provider redirect: whose OAuth app will ask for consent (Flowline's
 * or this workspace's own), its client id, the scopes and who configured it. Public identifiers only.
 */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "integration.manage");
  const provider = new URL(req.url).searchParams.get("provider") ?? "";
  return json({ app: /^[a-z_]{1,40}$/.test(provider) ? await describeAuthorizationApp(workspace.id, provider) : null });
});
