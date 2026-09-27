import { z } from "zod";
import { requireUser, requireWorkspace } from "@/server/access";
import { json, parseBody, route } from "@/server/http";
import { getSsoConfig, saveSsoConfig } from "@/server/sso";

type Ctx = { params: Promise<{ wid: string }> };

/** SSO config for the settings page — never includes the client secret. */
export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { wid } = await params;
  const { role } = await requireWorkspace(user, wid, "viewer");
  return json({ config: await getSsoConfig(user, wid), canManage: role === "owner" });
});

export const PUT = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const body = await parseBody(
    req,
    z.object({
      issuer: z.string().min(1).max(500),
      clientId: z.string().max(200),
      clientSecret: z.string().max(4000).optional(),
      domains: z.array(z.string().max(253)).max(50),
      defaultRole: z.enum(["viewer", "editor", "owner"]),
      enabled: z.boolean(),
    }),
  );
  const config = await saveSsoConfig(user, (await params).wid, body);
  return json({ config });
});
