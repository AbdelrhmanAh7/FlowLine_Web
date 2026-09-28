import { afterEach, describe, expect, it, vi } from "vitest";
import { getEmailProvider } from "@/server/email";

afterEach(() => vi.unstubAllEnvs());

function withEnv(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
}

describe("the DB outbox is never the email provider of a real production build", () => {
  it("is refused in a production build outside the test and staging stacks", () => {
    for (const flowlineEnv of [undefined, "", "beta", "production", "Staging"]) {
      withEnv({ NODE_ENV: "production", FLOWLINE_ENV: flowlineEnv, FLOWLINE_EMAIL_PROVIDER: "outbox" });
      expect(() => getEmailProvider(), String(flowlineEnv)).toThrow(/production/);
    }
  });
  it("is allowed on the explicit test and staging stacks (release checks read verification links from it)", () => {
    for (const flowlineEnv of ["test", "staging"]) {
      withEnv({ NODE_ENV: "production", FLOWLINE_ENV: flowlineEnv, FLOWLINE_EMAIL_PROVIDER: "outbox" });
      expect(() => getEmailProvider()).not.toThrow();
    }
  });
});
