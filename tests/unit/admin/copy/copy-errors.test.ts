import { describe, it, expect } from "vitest";
import { ApiError } from "@/lib/api";
import { copyErrorKey } from "@/app/admin/copy/copy-errors";

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