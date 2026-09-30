import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { opsStatus } from "@/server/ops";

export const dynamic = "force-dynamic";

/**
 * Internal operational status for monitoring (P4-11). Requires `Authorization: Bearer $FLOWLINE_OPS_TOKEN`; without a
 * configured token it doesn't exist (404). The beta proxy also blocks /api/ops/* — the monitor calls it on the
 * internal network. Aggregates only; no user content.
 */
export async function GET(req: Request) {
  const token = process.env.FLOWLINE_OPS_TOKEN ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = token.length >= 24 && given.length === token.length && timingSafeEqual(Buffer.from(given), Buffer.from(token));
  if (!ok) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  const status = await opsStatus({ dataDir: process.env.FLOWLINE_OPS_DATA_DIR || undefined, backupDir: process.env.FLOWLINE_OPS_BACKUP_DIR || undefined });
  return NextResponse.json(status, { status: status.status === "fail" ? 503 : 200, headers: { "cache-control": "no-store" } });
}
