import { z } from "zod";
import { db } from "@/db";
import { requireUser, requireWorkspace } from "@/server/access";
import { capBody, HttpError, json, route } from "@/server/http";
import { addSource, KNOWLEDGE_MAX_BYTES, listSources } from "@/server/knowledge";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "knowledge.view");
  return json({ sources: await listSources(db, workspace.id) });
});

const textBody = z.object({ name: z.string().trim().min(1).max(120), text: z.string().min(1).max(KNOWLEDGE_MAX_BYTES) });

/** Add a knowledge source: multipart field "file" (txt, md, csv, json, pdf; 5MB) or JSON { name, text }. */
export const POST = route(async (raw0, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "knowledge.manage");
  const type = raw0.headers.get("content-type") ?? "";
  // Multipart/JSON overhead on top of the 5MB content limit; enforced while streaming, before any parsing.
  const req = await capBody(raw0, KNOWLEDGE_MAX_BYTES + 64 * 1024, new HttpError(413, "SOURCE_TOO_LARGE", "Knowledge sources are limited to 5MB"));
  if (type.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "VALIDATION", 'Attach a file in the "file" field');
    if (file.size > KNOWLEDGE_MAX_BYTES) throw new HttpError(413, "SOURCE_TOO_LARGE", "Knowledge sources are limited to 5MB");
    const source = await addSource(db, user, workspace.id, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()), mime: file.type, kind: "file" });
    return json({ source }, { status: 201 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "BAD_JSON", "Send multipart/form-data with a file, or JSON { name, text }");
  }
  const b = textBody.parse(raw);
  const source = await addSource(db, user, workspace.id, { name: b.name, bytes: Buffer.from(b.text, "utf8"), mime: "text/plain", kind: "text" });
  return json({ source }, { status: 201 });
});
