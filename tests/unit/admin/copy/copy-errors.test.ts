import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { handleWriteError, type CopyErrorKey, type WriteErrorEffects } from "@/app/admin/copy/copy-errors";

const FALLBACKS = ["platformAdmin.copyEditor.saveError", "platformAdmin.copyEditor.publishError"] as const;

/** The editor's state setters and queries as fakes; `t` tags the key so each test sees which message was shown. */
const editor = (stepUpUntil: string | null = null) => ({
  t: vi.fn((key: CopyErrorKey) => "t:" + key),
  setError: vi.fn<WriteErrorEffects["setError"]>(),
  setStepUpActive: vi.fn<WriteErrorEffects["setStepUpActive"]>(),
  refetchMe: vi.fn<WriteErrorEffects["refetchMe"]>(async () => ({ data: { stepUpUntil } })),
  refetchCopy: vi.fn<WriteErrorEffects["refetchCopy"]>(async () => undefined),
});

describe("handleWriteError (what the editor does after a failed save or publish)", () => {
  // Only Date is faked, so step-up expiry is judged against a fixed "now"; promises and timers stay real.
  beforeEach(() => { vi.useFakeTimers({ now: new Date("2026-10-13T12:00:00.000Z"), toFake: ["Date"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it.each([
    { on: "REVISION_CONFLICT (409)", cause: new ApiError(409, "REVISION_CONFLICT", "Draft changed. Reload and try again."), shows: "conflict" },
    { on: "a network failure (status 0)", cause: new ApiError(0, "NETWORK", "Can't reach Flowline"), shows: "networkError" },
    { on: "a 500", cause: new ApiError(500, "INTERNAL", "Something went wrong on our side"), shows: "serverError" },
    { on: "a 503 without a JSON body", cause: new ApiError(503, "HTTP_503", "Request failed (503)"), shows: "serverError" },
    { on: "a 400", cause: new ApiError(400, "VALIDATION", "Invalid request"), shows: "fallback" },
    { on: "a 401", cause: new ApiError(401, "UNAUTHORIZED", "Unauthorized"), shows: "fallback" },
    { on: "a 403 other than step-up", cause: new ApiError(403, "CSRF_TOKEN_INVALID", "Invalid CSRF token"), shows: "fallback" },
    { on: "a 404", cause: new ApiError(404, "NOT_FOUND", "Not found"), shows: "fallback" },
    { on: "a 422", cause: new ApiError(422, "UNPROCESSABLE", "Unprocessable"), shows: "fallback" },
    { on: "a plain Error", cause: new Error("generic"), shows: "fallback" },
    { on: "a thrown string", cause: "string error", shows: "fallback" },
    { on: "null", cause: null, shows: "fallback" },
    { on: "undefined", cause: undefined, shows: "fallback" },
    { on: "an object that only looks like an ApiError", cause: { code: "REVISION_CONFLICT" }, shows: "fallback" },
  ])("on $on shows the translated $shows message, never the server's text, and reloads the copy state", async ({ cause, shows }) => {
    for (const fallback of FALLBACKS) {
      const fx = editor();
      await handleWriteError(cause, fallback, fx);
      expect(fx.setError).toHaveBeenCalledExactlyOnceWith("t:" + (shows === "fallback" ? fallback : "platformAdmin.copyEditor." + shows));
      expect(fx.refetchCopy).toHaveBeenCalledTimes(1);
      expect(fx.refetchMe).not.toHaveBeenCalled();
      expect(fx.setStepUpActive).not.toHaveBeenCalled();
    }
  });

  it.each([
    { refreshed: "still valid", stepUpUntil: "2026-10-13T12:01:00.000Z", active: true },
    { refreshed: "expired", stepUpUntil: "2026-10-13T11:59:00.000Z", active: false },
    { refreshed: "missing", stepUpUntil: null, active: false },
  ])("on STEP_UP_REQUIRED with the refreshed step-up $refreshed: shows the step-up message, re-reads the session, sets stepUpActive to $active, keeps the copy state", async ({ stepUpUntil, active }) => {
    const fx = editor(stepUpUntil);
    await handleWriteError(new ApiError(403, "STEP_UP_REQUIRED", "Step-up required"), "platformAdmin.copyEditor.publishError", fx);
    expect(fx.setError).toHaveBeenCalledExactlyOnceWith("t:platformAdmin.copyEditor.stepUp");
    expect(fx.refetchMe).toHaveBeenCalledTimes(1);
    expect(fx.setStepUpActive).toHaveBeenCalledExactlyOnceWith(active);
    expect(fx.refetchCopy).not.toHaveBeenCalled();
  });

  it("on STEP_UP_REQUIRED keeps writes disabled when re-reading the session returns no data", async () => {
    const fx = editor("2026-10-13T12:01:00.000Z");
    fx.refetchMe.mockResolvedValueOnce({ data: undefined });
    await handleWriteError(new ApiError(403, "STEP_UP_REQUIRED", "Step-up required"), "platformAdmin.copyEditor.saveError", fx);
    expect(fx.setStepUpActive).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("shows the message before any reload settles, so a retried or offline-paused refetch cannot hide it", () => {
    const never = () => new Promise<never>(() => {}); // like a TanStack refetch paused while the browser is offline
    const network = editor();
    network.refetchCopy.mockImplementationOnce(never);
    void handleWriteError(new ApiError(0, "NETWORK", "Can't reach Flowline"), "platformAdmin.copyEditor.saveError", network);
    expect(network.setError).toHaveBeenCalledExactlyOnceWith("t:platformAdmin.copyEditor.networkError");
    const stepUp = editor();
    stepUp.refetchMe.mockImplementationOnce(never);
    void handleWriteError(new ApiError(403, "STEP_UP_REQUIRED", "Step-up required"), "platformAdmin.copyEditor.saveError", stepUp);
    expect(stepUp.setError).toHaveBeenCalledExactlyOnceWith("t:platformAdmin.copyEditor.stepUp");
  });
});
