import { sql } from "drizzle-orm";
import { db } from "@/db";
import { json } from "@/server/http";
import { workerStatus } from "@/server/runs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await db.execute(sql`select 1`);
    const worker = await workerStatus();
    // `?require=worker` lets test harnesses wait until the execution worker is up.
    const needWorker = new URL(req.url).searchParams.get("require") === "worker";
    return json({ db: "ok", worker: worker.online ? "ok" : "offline", workerLastSeenAt: worker.lastSeenAt }, { status: needWorker && !worker.online ? 503 : 200 });
  } catch {
    return json({ db: "down", worker: "unknown" }, { status: 503 });
  }
}
