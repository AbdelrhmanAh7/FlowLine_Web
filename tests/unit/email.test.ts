import { describe, expect, it } from "vitest";
import { recipientAllowed } from "@/server/email/sandbox";
import { safePath } from "@/server/email/redirect";
import { renderEmail } from "@/server/email/templates";

describe("account email safety", () => {
  it("defaults to Arabic RTL with a plain-text fallback and escaped HTML", () => {
    const message = renderEmail("verify", "https://example.test/?x=<script>");
    expect(message.html).toContain('dir="rtl"');
    expect(message.html).not.toContain("<script>");
    expect(message.text).toContain("https://example.test/?x=<script>");
    expect(renderEmail("reset", "https://example.test", "en").html).toContain('dir="ltr"');
  });
  it("enforces the recipient sandbox on exact addresses and domain suffixes", () => {
    expect(recipientAllowed("a@example.test", "a@example.test,@flowline.test")).toBe(true);
    expect(recipientAllowed("b@flowline.test", "a@example.test,@flowline.test")).toBe(true);
    expect(recipientAllowed("a@notflowline.test", "@flowline.test")).toBe(false);
    expect(recipientAllowed("a@qa.example.test", "*.example.test")).toBe(true);
    expect(recipientAllowed("a@fakeexample.test", "*.example.test")).toBe(false);
    expect(recipientAllowed("outside@example.test", "a@example.test")).toBe(false);
  });
  it("allows only local redirect paths", () => {
    expect(safePath("/app?tab=1")).toBe("/app?tab=1");
    for (const path of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)"]) expect(safePath(path)).toBe("/app");
  });
});
