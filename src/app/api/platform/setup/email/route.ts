import { z } from "zod";
import { setupConfigureEmail } from "@/server/platform-setup";
import { setupWrite } from "@/server/platform-setup-http";

export const dynamic = "force-dynamic";

/** Email-first bootstrap: the ONE credential a setup session may configure (delivery then goes only to the bound identity). */
export const PUT = setupWrite(
  z.object({ provider: z.enum(["resend", "postmark"]), from: z.string().min(3).max(300), secret: z.string().min(1).max(4096) }).strict(),
  async (ch, body) => {
    await setupConfigureEmail(ch, body);
    return { ok: true };
  },
);
