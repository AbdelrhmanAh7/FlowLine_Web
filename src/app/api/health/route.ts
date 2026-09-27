import { sql } from "drizzle-orm";
import { db } from "@/db";
import { json } from "@/server/http";
import { workerStatus } from "@/server/runs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    // Applied migration count = schema version: rollback checks compare it with what a release expects.
    const migrations = await db.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    const worker = await workerStatus();
    // `?require=worker` lets test harnesses wait until the execution worker is up.
    const needWorker = new URL(req.url).searchParams.get("require") === "worker";
    return json({ revision: process.env.FLOWLINE_RELEASE_SHA ?? "dev", schemaVersion: migrations.rows[0]?.n ?? 0, db: "ok", worker: worker.online ? "ok" : "offline", workerLastSeenAt: worker.lastSeenAt }, { status: needWorker && !worker.online ? 503 : 200 });
  } catch {
    return json({ db: "down", worker: "unknown" }, { status: 503 });
  }
}
