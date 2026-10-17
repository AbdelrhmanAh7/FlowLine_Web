import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, requireWorkspace } from "@/server/access";
import { capBody, HttpError, json, route, UPLOAD_BODY_READ_TIMEOUT_MS } from "@/server/http";
import { insertRetainedFile } from "@/server/retained-files";

type Ctx = { params: Promise<{ wid: string }> };

const FILE_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "text/csv", "application/json", "text/plain"]);

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid);
  const files = await db
    .select({ id: schema.fileObject.id, name: schema.fileObject.name, mime: schema.fileObject.mime, size: schema.fileObject.size, createdAt: schema.fileObject.createdAt })
    .from(schema.fileObject)
    .where(eq(schema.fileObject.workspaceId, workspace.id))
    .orderBy(desc(schema.fileObject.createdAt))
    .limit(100);
  return json({ files });
});

/** Upload a file (multipart form field "file"): PDF, CSV, JSON or text, 5MB max. */
export const POST = route(async (raw, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "flow.edit");
  // Enforced while streaming (chunked uploads have no Content-Length), before multipart parsing. Only an authorized
  // member reaches the longer upload deadline (the checks above run before any body byte is read).
  const req = await capBody(raw, FILE_MAX_BYTES + 64 * 1024, new HttpError(413, "FILE_TOO_LARGE", "Files are limited to 5MB"), UPLOAD_BODY_READ_TIMEOUT_MS);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "VALIDATION", "Attach a file in the \"file\" field");
  if (file.size > FILE_MAX_BYTES) throw new HttpError(413, "FILE_TOO_LARGE", "Files are limited to 5MB");
  const mime = file.type || "application/octet-stream";
  const bytes = Buffer.from(await file.arrayBuffer());
  const isPdf = bytes.subarray(0, 5).toString("latin1") === "%PDF-";
  if (!ALLOWED.has(mime) && !isPdf) throw new HttpError(415, "UNSUPPORTED_TYPE", "Upload a PDF, CSV, JSON or plain-text file");
  if (mime === "application/pdf" && !isPdf) throw new HttpError(415, "UNSUPPORTED_TYPE", "The file is not a valid PDF");
  const row = await db.transaction(tx => insertRetainedFile(tx, { workspaceId: workspace.id, name: file.name.slice(0, 120) || "upload", mime: isPdf ? "application/pdf" : mime, data: bytes, createdBy: user.id }));
  return json({ file: row }, { status: 201 });
});
