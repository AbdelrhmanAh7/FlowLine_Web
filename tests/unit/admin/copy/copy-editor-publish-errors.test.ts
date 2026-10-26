import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleWriteError, type CopyErrorKey, type WriteErrorEffects } from "@/app/admin/copy/copy-errors";
import { ApiError } from "@/lib/api";

const root = resolve(__dirname, "../../../..");

export function findCopyEditorViolations(content: string): string[] {
  const violations: string[] = [];
  const patterns = [
    {
      regex: /async\s+function\s+handleWriteError\b/i,
      description: "Inline handleWriteError in copy-editor.tsx (should import from ./copy-errors)",
    },
    {
      regex: /errors\.\$\{cause\.code\}|errors\.REVISION_CONFLICT|errors\.NETWORK/i,
      description: "Generic errors.* key interpolation in copy-editor.tsx (should use platformAdmin.copyEditor.*)",
    },
    {
      regex: /as\s+MessageKey/i,
      description: "Unsafe MessageKey casting in copy-editor.tsx for error mapping",
    },
    {
      regex: /t\("common\.retry"\)/i,
      description: "Using common.retry instead of canonical ui.retry in copy-editor.tsx",
    },
  ];

  for (const { regex, description } of patterns) {
    if (regex.test(content)) violations.push(description);
  }
  return violations;
}

export const HISTORICAL_PR329_SNIPPET = `
  async function handleWriteError(cause: unknown, fallbackKey: "platformAdmin.copyEditor.saveError" | "platformAdmin.copyEditor.publishError") {
    if (cause instanceof ApiError) {
      if (cause.code === "REVISION_CONFLICT" || cause.code === "NETWORK") {
        await state.refetch();
        const errorKey = \`errors.\${cause.code}\` as MessageKey;
        setError(t(errorKey));
        return;
      }
    }
    await state.refetch();
    setError(t(fallbackKey));
  }
  // Load error with ad-hoc retry
  <Button variant="ghost" size="sm" onClick={() => void state.refetch()}>{t("common.retry")}</Button>
`;

const mockEditor = (stepUpUntil: string | null = null) => ({
  t: vi.fn((key: CopyErrorKey) => `t:${key}`),
  setError: vi.fn<WriteErrorEffects["setError"]>(),
  setStepUpActive: vi.fn<WriteErrorEffects["setStepUpActive"]>(),
  refetchMe: vi.fn<WriteErrorEffects["refetchMe"]>(async () => ({ data: { stepUpUntil } })),
  refetchCopy: vi.fn<WriteErrorEffects["refetchCopy"]>(async () => undefined),
});

describe("@issue-471 guard against unauthorized copy-editor.tsx core logic regressions (split from #329)", () => {
  it("AC1: rejects historical PR #329 finding: inline handleWriteError, errors.* interpolation, and ad-hoc retry", () => {
    const violations = findCopyEditorViolations(HISTORICAL_PR329_SNIPPET);
    expect(violations).toContain("Inline handleWriteError in copy-editor.tsx (should import from ./copy-errors)");
    expect(violations).toContain("Generic errors.* key interpolation in copy-editor.tsx (should use platformAdmin.copyEditor.*)");
    expect(violations).toContain("Unsafe MessageKey casting in copy-editor.tsx for error mapping");
    expect(violations).toContain("Using common.retry instead of canonical ui.retry in copy-editor.tsx");
    expect(violations.length).toBe(4);
  });

  it("AC1: verifies that src/app/admin/copy/copy-editor.tsx adheres to architectural boundaries", () => {
    const copyEditorPath = resolve(root, "src/app/admin/copy/copy-editor.tsx");
    const content = readFileSync(copyEditorPath, "utf8");

    // 0 violations of the forbidden patterns
    expect(findCopyEditorViolations(content)).toEqual([]);

    // Confirms proper delegation to copy-errors module
    expect(content).toMatch(/import\s*\{\s*handleWriteError\s*\}\s*from\s*"\.\/copy-errors"/);

    // Confirms retry button uses canonical ui.retry from #180/#322
    expect(content).toMatch(/t\("ui\.retry"\)/);
  });
});

describe("@issue-471 copy editor publish error handling without ad-hoc copy-editor.tsx logic", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-26T12:00:00.000Z"), toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("AC4: on publish 500 INTERNAL shows serverError, reloads copy state, and does not touch session", async () => {
    const fx = mockEditor();
    const serverError = new ApiError(500, "INTERNAL", "Database connection pool timeout");

    await handleWriteError(serverError, "platformAdmin.copyEditor.publishError", fx);

    expect(fx.setError).toHaveBeenCalledExactlyOnceWith("t:platformAdmin.copyEditor.serverError");
    expect(fx.setError).not.toHaveBeenCalledWith(expect.stringContaining("Database connection pool timeout"));
    expect(fx.setError).not.toHaveBeenCalledWith("t:errors.INTERNAL");
    expect(fx.refetchCopy).toHaveBeenCalledTimes(1);
    expect(fx.refetchMe).not.toHaveBeenCalled();
    expect(fx.setStepUpActive).not.toHaveBeenCalled();
  });

  it("AC2: on publish 409 REVISION_CONFLICT shows conflict error and reloads copy state (not errors.REVISION_CONFLICT)", async () => {
    const fx = mockEditor();
    const conflictError = new ApiError(409, "REVISION_CONFLICT", "Revision 2 is outdated; current is 3");

    await handleWriteError(conflictError, "platformAdmin.copyEditor.publishError", fx);

    expect(fx.setError).toHaveBeenCalledExactlyOnceWith("t:platformAdmin.copyEditor.conflict");
    expect(fx.setError).not.toHaveBeenCalledWith("t:errors.REVISION_CONFLICT");
    expect(fx.refetchCopy).toHaveBeenCalledTimes(1);
    expect(fx.refetchMe).not.toHaveBeenCalled();
  });

  it("AC2: on publish NETWORK error shows networkError and reloads copy state (not errors.NETWORK)", async () => {
    const fx = mockEditor();
    const networkError = new ApiError(0, "NETWORK", "Failed to fetch /api/platform/copy");

    await handleWriteError(networkError, "platformAdmin.copyEditor.publishError", fx);

    expect(fx.setError).toHaveBeenCalledExactlyOnceWith("t:platformAdmin.copyEditor.networkError");
    expect(fx.setError).not.toHaveBeenCalledWith("t:errors.NETWORK");
    expect(fx.refetchCopy).toHaveBeenCalledTimes(1);
    expect(fx.refetchMe).not.toHaveBeenCalled();
  });

  it("AC4: on publish STEP_UP_REQUIRED shows stepUp prompt, refetches session, and sets stepUpActive", async () => {
    const fxValid = mockEditor("2026-10-26T12:05:00.000Z");
    const stepUpError = new ApiError(403, "STEP_UP_REQUIRED", "Step-up authentication required");

    await handleWriteError(stepUpError, "platformAdmin.copyEditor.publishError", fxValid);

    expect(fxValid.setError).toHaveBeenCalledExactlyOnceWith("t:platformAdmin.copyEditor.stepUp");
    expect(fxValid.refetchMe).toHaveBeenCalledTimes(1);
    expect(fxValid.setStepUpActive).toHaveBeenCalledExactlyOnceWith(true);
    expect(fxValid.refetchCopy).not.toHaveBeenCalled();

    const fxExpired = mockEditor("2026-10-26T11:55:00.000Z");
    await handleWriteError(stepUpError, "platformAdmin.copyEditor.publishError", fxExpired);
    expect(fxExpired.setStepUpActive).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("AC4: on unhandled publish error (e.g. 400 VALIDATION or plain Error) shows fallback publishError", async () => {
    const fx = mockEditor();
    const validationError = new ApiError(400, "VALIDATION", "Invalid publish revision");

    await handleWriteError(validationError, "platformAdmin.copyEditor.publishError", fx);

    expect(fx.setError).toHaveBeenCalledExactlyOnceWith("t:platformAdmin.copyEditor.publishError");
    expect(fx.refetchCopy).toHaveBeenCalledTimes(1);
    expect(fx.refetchMe).not.toHaveBeenCalled();
  });
});
