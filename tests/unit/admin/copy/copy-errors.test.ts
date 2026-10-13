import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { copyErrorKey, handleWriteError, shouldRefetchAfterWriteError, type CopyErrorKey, type WriteErrorEffects } from "@/app/admin/copy/copy-errors";

describe("copyErrorKey", () => {
  const saveFallback = "platformAdmin.copyEditor.saveError";
  const publishFallback = "platformAdmin.copyEditor.publishError";

  it("maps REVISION_CONFLICT (409) to conflict key", () => {
    const err = new ApiError(409, "REVISION_CONFLICT", "Conflict");
    expect(copyErrorKey(err, saveFallback)).toBe("platformAdmin.copyEditor.conflict");
    expect(copyErrorKey(err, publishFallback)).toBe("platformAdmin.copyEditor.conflict");
  });

  it("maps STEP_UP_REQUIRED to stepUp key", () => {
    const err = new ApiError(403, "STEP_UP_REQUIRED", "Step up required");
    expect(copyErrorKey(err, saveFallback)).toBe("platformAdmin.copyEditor.stepUp");
    expect(copyErrorKey(err, publishFallback)).toBe("platformAdmin.copyEditor.stepUp");
  });

  it("maps network error (status 0) to networkError key", () => {
    const err = new ApiError(0, "NETWORK", "Network error");
    expect(copyErrorKey(err, saveFallback)).toBe("platformAdmin.copyEditor.networkError");
    expect(copyErrorKey(err, publishFallback)).toBe("platformAdmin.copyEditor.networkError");
  });

  it("maps server error (status >= 500) to serverError key", () => {
    const err500 = new ApiError(500, "INTERNAL", "Server error");
    const err503 = new ApiError(503, "SERVICE_UNAVAILABLE", "Service unavailable");
    expect(copyErrorKey(err500, saveFallback)).toBe("platformAdmin.copyEditor.serverError");
    expect(copyErrorKey(err503, saveFallback)).toBe("platformAdmin.copyEditor.serverError");
    expect(copyErrorKey(err500, publishFallback)).toBe("platformAdmin.copyEditor.serverError");
  });

  it("maps other API errors to the fallback key", () => {
    const err400 = new ApiError(400, "VALIDATION", "Bad request");
    const err401 = new ApiError(401, "UNAUTHORIZED", "Unauthorized");
    const err403 = new ApiError(403, "FORBIDDEN", "Forbidden");
    const err404 = new ApiError(404, "NOT_FOUND", "Not found");
    const err422 = new ApiError(422, "UNPROCESSABLE", "Unprocessable");

    expect(copyErrorKey(err400, saveFallback)).toBe(saveFallback);
    expect(copyErrorKey(err401, saveFallback)).toBe(saveFallback);
    expect(copyErrorKey(err403, saveFallback)).toBe(saveFallback);
    expect(copyErrorKey(err404, saveFallback)).toBe(saveFallback);
    expect(copyErrorKey(err422, saveFallback)).toBe(saveFallback);
    expect(copyErrorKey(err400, publishFallback)).toBe(publishFallback);
  });

  it("maps non-ApiError causes to the fallback key", () => {
    expect(copyErrorKey(new Error("generic"), saveFallback)).toBe(saveFallback);
    expect(copyErrorKey("string error", saveFallback)).toBe(saveFallback);
    expect(copyErrorKey(null, saveFallback)).toBe(saveFallback);
    expect(copyErrorKey(undefined, saveFallback)).toBe(saveFallback);
    expect(copyErrorKey({ code: "WEIRD" }, saveFallback)).toBe(saveFallback);
  });
});

describe("shouldRefetchAfterWriteError", () => {
  it("refetches after a revision conflict and after a lost response (network)", () => {
    expect(shouldRefetchAfterWriteError(new ApiError(409, "REVISION_CONFLICT", "Conflict"))).toBe(true);
    expect(shouldRefetchAfterWriteError(new ApiError(0, "NETWORK", "Network error"))).toBe(true);
  });

  it("does not refetch after step-up, validation, server or non-API failures", () => {
    expect(shouldRefetchAfterWriteError(new ApiError(403, "STEP_UP_REQUIRED", "Step up"))).toBe(false);
    expect(shouldRefetchAfterWriteError(new ApiError(400, "VALIDATION", "Bad request"))).toBe(false);
    expect(shouldRefetchAfterWriteError(new ApiError(500, "INTERNAL", "Server error"))).toBe(false);
    expect(shouldRefetchAfterWriteError(new Error("generic"))).toBe(false);
    expect(shouldRefetchAfterWriteError(null)).toBe(false);
  });
});

describe("handleWriteError (what the editor does after a failed save or publish)", () => {
  /** The editor's state setters and queries as fakes; `t` tags the key so each test sees which message was shown. */
  const editor = (stepUpUntil: string | null = null) => ({
    t: vi.fn((key: CopyErrorKey) => "t:" + key),
    setError: vi.fn<WriteErrorEffects["setError"]>(),
    setStepUpActive: vi.fn<WriteErrorEffects["setStepUpActive"]>(),
    refetchMe: vi.fn<WriteErrorEffects["refetchMe"]>(async () => ({ data: { stepUpUntil } })),
    refetchCopy: vi.fn<WriteErrorEffects["refetchCopy"]>(async () => undefined),
  });
  // Only Date is faked, so step-up expiry is judged against a fixed "now"; promises and timers stay real.
  beforeEach(() => { vi.useFakeTimers({ now: new Date("2026-10-13T12:00:00.000Z"), toFake: ["Date"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("on REVISION_CONFLICT reloads the copy state and shows the conflict message", async () => {
    const fx = editor();
    await handleWriteError(new ApiError(409, "REVISION_CONFLICT", "Draft changed. Reload and try again."), "platformAdmin.copyEditor.saveError", fx);
    expect(fx.refetchCopy).toHaveBeenCalledTimes(1);
    expect(fx.setError).toHaveBeenCalledExactlyOnceWith("t:platformAdmin.copyEditor.conflict");
    expect(fx.refetchMe).not.toHaveBeenCalled();
    expect(fx.setStepUpActive).not.toHaveBeenCalled();
  });

  it.each([
    { refreshed: "still valid", stepUpUntil: "2026-10-13T12:01:00.000Z", active: true },
    { refreshed: "expired", stepUpUntil: "2026-10-13T11:59:00.000Z", active: false },
    { refreshed: "missing", stepUpUntil: null, active: false },
  ])("on STEP_UP_REQUIRED with the refreshed step-up $refreshed: re-reads the session, sets stepUpActive to $active, shows the step-up message, keeps the copy state", async ({ stepUpUntil, active }) => {
    const fx = editor(stepUpUntil);
    await handleWriteError(new ApiError(403, "STEP_UP_REQUIRED", "Step-up required"), "platformAdmin.copyEditor.publishError", fx);
    expect(fx.refetchMe).toHaveBeenCalledTimes(1);
    expect(fx.setStepUpActive).toHaveBeenCalledExactlyOnceWith(active);
    expect(fx.setError).toHaveBeenCalledExactlyOnceWith("t:platformAdmin.copyEditor.stepUp");
    expect(fx.refetchCopy).not.toHaveBeenCalled();
  });

  it("on STEP_UP_REQUIRED keeps writes disabled when re-reading the session returns no data", async () => {
    const fx = editor("2026-10-13T12:01:00.000Z");
    fx.refetchMe.mockResolvedValueOnce({ data: undefined });
    await handleWriteError(new ApiError(403, "STEP_UP_REQUIRED", "Step-up required"), "platformAdmin.copyEditor.saveError", fx);
    expect(fx.setStepUpActive).toHaveBeenCalledExactlyOnceWith(false);
    expect(fx.setError).toHaveBeenCalledExactlyOnceWith("t:platformAdmin.copyEditor.stepUp");
  });

  it("on a network failure (the write may have committed) reloads the copy state and shows the network message", async () => {
    const fx = editor();
    await handleWriteError(new ApiError(0, "NETWORK", "Can't reach Flowline — check your connection"), "platformAdmin.copyEditor.saveError", fx);
    expect(fx.refetchCopy).toHaveBeenCalledTimes(1);
    expect(fx.setError).toHaveBeenCalledExactlyOnceWith("t:platformAdmin.copyEditor.networkError");
    expect(fx.refetchMe).not.toHaveBeenCalled();
  });

  it("on a 5xx shows the translated server-error message, not the server's text, and keeps the copy state", async () => {
    const fx = editor();
    await handleWriteError(new ApiError(500, "INTERNAL", "Something went wrong on our side"), "platformAdmin.copyEditor.publishError", fx);
    expect(fx.setError).toHaveBeenCalledExactlyOnceWith("t:platformAdmin.copyEditor.serverError");
    expect(fx.refetchCopy).not.toHaveBeenCalled();
    expect(fx.refetchMe).not.toHaveBeenCalled();
  });

  it("on any other failure shows the save or publish fallback and keeps the copy state", async () => {
    const cases = [
      [new ApiError(400, "VALIDATION", "Invalid request"), "platformAdmin.copyEditor.saveError"],
      [new ApiError(400, "VALIDATION", "Invalid request"), "platformAdmin.copyEditor.publishError"],
      [new Error("not an ApiError"), "platformAdmin.copyEditor.saveError"],
    ] as const;
    for (const [cause, fallback] of cases) {
      const fx = editor();
      await handleWriteError(cause, fallback, fx);
      expect(fx.setError).toHaveBeenCalledExactlyOnceWith("t:" + fallback);
      expect(fx.refetchCopy).not.toHaveBeenCalled();
      expect(fx.refetchMe).not.toHaveBeenCalled();
    }
  });
});
