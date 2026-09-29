import { platformRead } from "@/server/platform-http";
import { listAdmins } from "@/server/platform-setup";

export const dynamic = "force-dynamic";

export const GET = platformRead(async () => ({ admins: await listAdmins() }));
