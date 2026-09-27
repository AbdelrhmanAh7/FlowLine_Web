import { sql } from "drizzle-orm";
import { db } from "@/db";
import { json } from "@/server/http";
import { workerStatus } from "@/server/runs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    const worker = await workerStatus();
    return json({ db: "ok", worker: worker.online ? "ok" : "offline", workerLastSeenAt: worker.lastSeenAt });
  } catch {
    return json({ db: "down", worker: "unknown" }, { status: 503 });
  }
}
