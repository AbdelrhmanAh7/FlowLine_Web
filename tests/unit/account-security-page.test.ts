import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ar } from "@/i18n/messages/ar";
import { en } from "@/i18n/messages/en";

// Issue #196 AC4: every string of the account security page and its menu entry exists in the Arabic source of truth
// and in English, and the page uses logical (direction-agnostic) classes only, so it is correct in RTL.
const PAGE = "src/app/account/security/page.tsx";
const KEYS = [
  "meta.accountSecurity",
  "shell.userMenu.security",
  "account.security.title",
  "account.security.back",
  "account.security.twoFactor.title",
  "account.security.twoFactor.on",
  "account.security.twoFactor.off",
] as const;
const lookup = (cat: unknown, key: string) => key.split(".").reduce<unknown>((n, k) => (n as Record<string, unknown> | undefined)?.[k], cat);
const ARABIC = /[؀-ۿ]/;
// Physical-direction Tailwind utilities that break in RTL; their logical twins are ms/me/ps/pe/start/end/text-start.
const PHYSICAL = /(?:^|[\s"'`:])-?(?:text-(?:left|right)|[mp][lr]-|(?:left|right)-|rounded-[lr](?:-|\b)|border-[lr](?:-|\b)|float-(?:left|right))/;

describe("account security page (#196)", () => {
  it.each(KEYS)("%s is translated in Arabic and English", (key) => {
    const arText = lookup(ar, key), enText = lookup(en, key);
    expect(typeof arText, `ar:${key}`).toBe("string");
    expect(typeof enText, `en:${key}`).toBe("string");
    expect(arText as string, `ar:${key} is Arabic`).toMatch(ARABIC);
  });

  it("uses the Arabic two-step verification title from the issue", () => {
    expect(ar.account.security.twoFactor.title).toBe("التحقق بخطوتين");
    expect(en.account.security.twoFactor.title).toBe("Two-step verification");
  });

  it("renders only catalogue keys and logical CSS", () => {
    const src = readFileSync(PAGE, "utf8");
    for (const key of KEYS.filter((k) => k !== "shell.userMenu.security")) expect(src, key).toContain(`"${key}"`);
    const classes = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
    expect(classes.length).toBeGreaterThan(0);
    for (const c of classes) expect(c, c).not.toMatch(PHYSICAL);
    expect(src).toContain("text-start");
  });

  it("the physical-class check catches a text-left regression", () => {
    expect(' className="text-left"').toMatch(PHYSICAL);
    expect("ml-2").toMatch(PHYSICAL);
    expect("ms-2 text-start justify-between").not.toMatch(PHYSICAL);
  });
});
