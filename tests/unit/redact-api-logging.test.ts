import { afterEach, expect, it, vi } from "vitest";
import { route } from "@/server/http";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("scrubs multiline database parameters from the API error log and response", async () => {
  vi.stubEnv("FLOWLINE_TELEMETRY", "off");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const marker = "synthetic-multiline-db-credential";
  const handler = route(async () => {
    throw new Error("Failed operation", { cause: new Error(`Failed query: select $1\nparams: first\n${marker}`) });
  });
  const response = await handler(new Request("https://flowline.example/test"), undefined);
  expect(response.status).toBe(500);
  expect(log).toHaveBeenCalledOnce();
  expect(JSON.stringify(log.mock.calls)).not.toContain(marker);
  expect(await response.text()).not.toContain(marker);
});
