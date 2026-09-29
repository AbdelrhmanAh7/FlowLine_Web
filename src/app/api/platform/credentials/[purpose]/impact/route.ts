import { platformRead } from "@/server/platform-http";
import { affectedConnections } from "@/server/platform-secrets";

export const dynamic = "force-dynamic";

/** How many active connections a switch, revoke or clear of this credential would send to reconnect. */
export const GET = platformRead<{ purpose: string }>(async (_ctx, _req, { purpose }) => ({ affectedConnections: await affectedConnections(purpose) }));
