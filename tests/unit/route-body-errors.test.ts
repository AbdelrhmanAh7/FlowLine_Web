import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  select: vi.fn(),
  applyWebhookEvent: vi.fn(),
  webhookSignatureHeader: vi.fn(async () => "stripe-signature"),
  limitKeyOps: vi.fn(),
  testAiConnection: vi.fn(),
  inferenceTest: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { select: deps.select }, schema: {} }));
vi.mock("@/billing/service", () => ({ applyWebhookEvent: deps.applyWebhookEvent, webhookSignatureHeader: deps.webhookSignatureHeader }));
vi.mock("@/server/publish", () => ({ WEBHOOK_MAX_BYTES: 256 * 1024, verifyGithubSignature: vi.fn(), verifyWebhookSignature: vi.fn() }));
vi.mock("@/server/runs", () => ({ enqueueRunEx: vi.fn() }));
vi.mock("@/server/access", () => ({
  requireUser: vi.fn(async () => ({ id: "user" })),
  requireWorkspace: vi.fn(async () => ({ workspace: { id: "workspace" } })),
}));
vi.mock("@/ai/hub/connections", () => ({
  getAiConnection: vi.fn(async () => ({ id: "connection" })),
  limitKeyOps: deps.limitKeyOps,
  testAiConnection: deps.testAiConnection,
  inferenceTest: deps.inferenceTest,
}));

import { POST as billing } from "@/app/api/billing/webhook/route";
import { POST as hook } from "@/app/api/hooks/[token]/route";
import { POST as aiTest } from "@/app/api/workspaces/[wid]/ai/connections/[cid]/test/route";
import { WebhookVerificationError } from "@/billing/types";
import { BODY_READ_TIMEOUT_MS, JSON_BODY_MAX_BYTES } from "@/server/http";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

function request(body: BodyInit, length?: string) {
  return new Request("https://flowline.example/api/body-test", {
    method: "POST",
    headers: { "content-type": "application/json", ...(length ? { "content-length": length } : {}) },
    body,
    duplex: "half",
  } as RequestInit);
}

function expectNoDownstreamWork() {
  expect(deps.select).not.toHaveBeenCalled();
  expect(deps.applyWebhookEvent).not.toHaveBeenCalled();
  expect(deps.webhookSignatureHeader).not.toHaveBeenCalled();
  expect(deps.limitKeyOps).not.toHaveBeenCalled();
  expect(deps.testAiConnection).not.toHaveBeenCalled();
  expect(deps.inferenceTest).not.toHaveBeenCalled();
}

describe("route body error responses", () => {
  for (const [name, invoke, budget, overflowCode, flatError] of [
    ["billing webhook", (req: Request) => billing(req, undefined), 256 * 1024, "PAYLOAD_TOO_LARGE", false],
    ["public webhook", (req: Request) => hook(req, { params: Promise.resolve({ token: "synthetic" }) }), 256 * 1024, "PAYLOAD_TOO_LARGE", true],
    ["AI connection test", (req: Request) => aiTest(req, { params: Promise.resolve({ wid: "workspace", cid: "connection" }) }), JSON_BODY_MAX_BYTES, "BODY_TOO_LARGE", false],
  ] as const) {
    it(`${name} preserves 408/BODY_READ_TIMEOUT for a stalled upload`, async () => {
      vi.useFakeTimers();
      const cancel = vi.fn();
      const response = invoke(request(new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}), cancel })));
      await vi.advanceTimersByTimeAsync(BODY_READ_TIMEOUT_MS);
      const result = await response;
      expect(result.status).toBe(408);
      const payload = await result.json();
      expect(flatError ? payload.code : payload.error.code).toBe("BODY_READ_TIMEOUT");
      expect(flatError ? payload.error : payload.error.message).toBe("Request body took too long to arrive");
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      expectNoDownstreamWork();
    });

    for (const length of [undefined, "1", String(budget + 1)]) {
      it(`${name} preserves 413/${overflowCode} with Content-Length ${length ?? "absent"}`, async () => {
        const stream = new ReadableStream<Uint8Array>({ start: (controller) => controller.enqueue(new Uint8Array(budget + 1)) });
        const result = await invoke(request(stream, length));
        expect(result.status).toBe(413);
        const payload = await result.json();
        expect(flatError ? payload.code : payload.error.code).toBe(overflowCode);
        if (flatError) expect(payload.error).toBe("Payload too large (256KB max)");
        expectNoDownstreamWork();
      });
    }
  }

  for (const input of ["{", '{"kind":"inference","modelId":"synthetic"}']) {
    it(`keeps the AI connection test's existing validation response for ${input}`, async () => {
      const result = await aiTest(request(input), { params: Promise.resolve({ wid: "workspace", cid: "connection" }) });
      expect(result.status).toBe(400);
      expect(await result.json()).toEqual({ error: { code: "VALIDATION", message: 'Use {"kind":"metadata"} or {"kind":"inference","modelId":…,"confirm":true}' } });
      expectNoDownstreamWork();
    });
  }

  it("keeps billing signature failures as 401/WEBHOOK_VERIFICATION_FAILED", async () => {
    deps.applyWebhookEvent.mockRejectedValueOnce(new WebhookVerificationError("Invalid signature"));
    const result = await billing(request("{}"), undefined);
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: { code: "WEBHOOK_VERIFICATION_FAILED", message: "Invalid signature" } });
  });
});
