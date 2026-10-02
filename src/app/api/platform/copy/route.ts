import { z } from "zod";
import { getCopyEditorState, editDraftCopyBatch, publishCopy } from "@/server/platform-copy";
import { platformRead, platformWrite } from "@/server/platform-http";

export const dynamic = "force-dynamic";

export const GET = platformRead(async () => getCopyEditorState());

const edit = z.object({ locale: z.enum(["ar", "en"]), key: z.string().max(200), value: z.string().max(1200).nullable() });
export const PATCH = platformWrite(
  z.object({ action: z.literal("edit"), edits: z.array(edit).min(1).max(2), expectedRevision: z.number().int().nonnegative() }),
  (ctx, body) => editDraftCopyBatch(ctx, body.edits, body.expectedRevision),
);

export const POST = platformWrite(
  z.object({ action: z.literal("publish"), expectedDraftRevision: z.number().int().nonnegative(), expectedPublishedRevision: z.number().int().nonnegative() }),
  (ctx, body) => publishCopy(ctx, body.expectedDraftRevision, body.expectedPublishedRevision),
);
