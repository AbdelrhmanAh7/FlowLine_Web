import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleWriteError, type CopyErrorKey, type WriteErrorEffects } from "@/app/admin/copy/copy-errors";
import { ApiError } from "@/lib/api";
import type { Locale } from "@/i18n/config";
import { createTranslator } from "@/i18n/translate";

const root = resolve(__dirname, "../../../..");

const queries = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  me: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => (queryKey[0] === "platform-copy" ? queries.state : queries.me),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const I18nProvider = (await import("@/i18n/client")).I18nProvider as FunctionComponent<{
  locale: Locale;
  overrides?: Record<string, Record<string, string>>;
  children?: ReactNode;
}>;
const { CopyEditor } = await import("@/app/admin/copy/copy-editor");

function renderEditor(locale: Locale = "en", overrides?: Record<string, Record<string, string>>) {
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      { locale, overrides },
      createElement(CopyEditor),
    ),
  );
}

/** Strips single-line and multi-line comments so comments never trigger false-positive pattern matches. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
}

/**
 * Narrow architectural boundary guard:
 * Detects unauthorized inline handleWriteError definitions and dynamic errors.* interpolation
 * without false-positives on comments, unrelated strings, or legitimate future as MessageKey uses.
 */
function findCopyEditorViolations(content: string): string[] {
  const code = stripComments(content);
  const violations: string[] = [];
  const patterns = [
    {
      regex: /(?:async\s+)?function\s+handleWriteError\b|const\s+handleWriteError\s*=/i,
      description: "Inline handleWriteError definition in copy-editor.tsx (should import from ./copy-errors)",
    },
    {
      regex: /`errors\.\$\{[^}]+\}`\s+as\s+MessageKey/i,
      description: "Dynamic errors.* key interpolation cast to MessageKey in copy-editor.tsx",
    },
  ];

  for (const { regex, description } of patterns) {
    if (regex.test(code)) violations.push(description);
  }
  return violations;
}

const HISTORICAL_PR329_SNIPPET = `
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
  it("AC1: rejects historical PR #329 finding: inline handleWriteError and dynamic errors.* casting", () => {
    const violations = findCopyEditorViolations(HISTORICAL_PR329_SNIPPET);
    expect(violations).toContain("Inline handleWriteError definition in copy-editor.tsx (should import from ./copy-errors)");
    expect(violations).toContain("Dynamic errors.* key interpolation cast to MessageKey in copy-editor.tsx");
    expect(violations.length).toBe(2);
  });

  it("AC1: verifies that src/app/admin/copy/copy-editor.tsx adheres to architectural boundaries", () => {
    const copyEditorPath = resolve(root, "src/app/admin/copy/copy-editor.tsx");
    const content = readFileSync(copyEditorPath, "utf8");

    // 0 violations of the forbidden patterns
    expect(findCopyEditorViolations(content)).toEqual([]);

    // Confirms proper delegation to copy-errors module
    expect(content).toMatch(/import\s*\{\s*handleWriteError\s*\}\s*from\s*"\.\/copy-errors"/);
  });
});

describe("@issue-471 render-level behavior of copy-editor on load failure", () => {
  beforeEach(() => {
    queries.state = { isPending: false, isError: true, isLoadingError: true, isFetching: false, data: undefined, refetch: vi.fn() };
    queries.me = { data: { csrfToken: "t", stepUpUntil: null }, isError: false, isLoadingError: false, refetch: vi.fn() };
  });

  it.each(["en", "ar"] as const)(
    "AC3: renders load error with canonical ui.retry button and never common.retry (%s)",
    (locale) => {
      const overrides = {
        [locale]: {
          "ui.retry": `UI_RETRY_CANONICAL_${locale}`,
          "common.retry": `COMMON_RETRY_FORBIDDEN_${locale}`,
        },
      };
      const html = renderEditor(locale, overrides);
      const t = createTranslator(locale);

      // Error banner is rendered with alert role
      expect(html).toContain('role="alert"');
      expect(html).toContain(t("platformAdmin.copyEditor.loadError"));

      // Asserts canonical ui.retry translation is used, not common.retry
      expect(html).toContain(`UI_RETRY_CANONICAL_${locale}`);
      expect(html).not.toContain(`COMMON_RETRY_FORBIDDEN_${locale}`);
    },
  );
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
