// @vitest-environment happy-dom
import { Fragment, act, createElement, type FunctionComponent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import type { Locale } from "@/i18n/config";
import { createTranslator } from "@/i18n/translate";

// Server render with a stubbed query layer: the editor's first paint for each load state (effects and handlers do not run here).
const queries = vi.hoisted(() => ({ state: {} as Record<string, unknown>, me: {} as Record<string, unknown> }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => (queryKey[0] === "platform-copy" ? queries.state : queries.me),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
// Keep the real ApiError (handleWriteError's instanceof check) and stub only the fetch wrapper, so a click can fail a write.
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

const I18nProvider = (await import("@/i18n/client")).I18nProvider as FunctionComponent<{ locale: Locale }>;
const { CopyEditor } = await import("@/app/admin/copy/copy-editor");

const render = (locale: Locale) => renderToStaticMarkup(createElement(I18nProvider, { locale }, createElement(CopyEditor)));
/** `text` as React writes it into markup (& < > " ' escaped); compared with toContain, so no pattern escaping is needed. */
const inMarkup = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
/** A copy state that loaded: one key in both locales, draft and published at revision 1. */
const loaded = { base: { ar: { "meta.title": "فلولاين" }, en: { "meta.title": "Flowline" } }, draft: { value: { ar: {}, en: {} }, revision: 1, setAt: null }, published: { value: { ar: {}, en: {} }, revision: 1, setAt: null } };
const session = { csrfToken: "t", stepUpUntil: null };

beforeEach(() => {
  queries.state = { isPending: false, isError: false, isLoadingError: false, data: loaded, refetch: vi.fn() };
  queries.me = { data: session, isError: false, isLoadingError: false, refetch: vi.fn() };
});

describe.each(["en", "ar"] as const)("CopyEditor error display (%s)", (locale) => {
  const t = createTranslator(locale);

  it("shows the admin-session alert, and keeps the page standing, when /api/platform/me never loaded", () => {
    queries.me = { data: undefined, isError: true, isLoadingError: true, refetch: vi.fn() };
    const html = render(locale);
    expect(html).toMatch(/<p role="alert"[^>]*>/);
    expect(html).toContain(">" + inMarkup(t("platformAdmin.copyEditor.meLoadError")) + "</p>");
    expect(html).toContain(inMarkup(t("platformAdmin.copyEditor.title")));
  });

  it("shows the load error with a Retry button when the copy state never loaded", () => {
    queries.state = { isPending: false, isError: true, isLoadingError: true, data: undefined, refetch: vi.fn() };
    const html = render(locale);
    expect(html).toContain(inMarkup(t("platformAdmin.copyEditor.loadError")));
    expect(html).toContain(">" + inMarkup(t("ui.retry")) + "</button>");
    expect(html).not.toContain("platformAdmin.copyEditor"); // a missing translation would show the raw key
  });

  it("keeps the editor, with no load or session alert, when a later reload fails", () => {
    queries.state = { isPending: false, isError: true, isLoadingError: false, data: loaded, refetch: vi.fn() };
    queries.me = { data: session, isError: true, isLoadingError: false, refetch: vi.fn() };
    const html = render(locale);
    expect(html).toContain(inMarkup(t("platformAdmin.copyEditor.search")));
    expect(html).not.toContain('role="alert"');
  });

  it("shows no error alert while loading", () => {
    queries.state = { isPending: true, isError: false, isLoadingError: false, data: undefined, refetch: vi.fn() };
    const html = render(locale);
    expect(html).not.toContain('role="alert"');
    expect(html).toContain(inMarkup(t("common.loading")));
  });
});

/**
 * Real DOM interaction: the server-render harness above cannot run save, publish or Retry. This mounts CopyEditor in
 * happy-dom, clicks its real controls, and checks the translated alert, the query refetch and the write-control state.
 */
describe("CopyEditor failures (interaction, en)", () => {
  const t = createTranslator("en");
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.clearAllMocks();
  });

  const mount = () => act(async () => { root.render(createElement(I18nProvider, { locale: "en" }, createElement(CopyEditor))); });
  const button = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
  const alert = () => container.querySelector('[role="alert"]')?.textContent ?? "";
  /** Text into a controlled field the way React reads it: set the native value, then fire the input event React listens for. */
  const type = async (selector: string, value: string) => {
    const el = container.querySelector<HTMLTextAreaElement>(selector)!;
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    await act(async () => { el.dispatchEvent(new window.Event("input", { bubbles: true })); });
  };
  const click = (el: Element) => act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
  /** A loaded copy state whose reload is observable, and an admin session with a step-up valid for a minute. */
  const writable = (refetch: () => Promise<unknown>, refetchMe: () => Promise<unknown> = vi.fn(async () => ({ data: { stepUpUntil: null } }))) => {
    queries.state = { isPending: false, isError: false, isLoadingError: false, isFetching: false, data: loaded, refetch };
    queries.me = { data: { csrfToken: "t", stepUpUntil: new Date(Date.now() + 60_000).toISOString() }, isError: false, isLoadingError: false, refetch: refetchMe };
  };

  it("shows the translated conflict alert, reloads the copy state, and leaves Save usable after the server rejects a save", async () => {
    const refetch = vi.fn(async () => undefined);
    writable(refetch);
    vi.mocked(api).mockRejectedValueOnce(new ApiError(409, "REVISION_CONFLICT", "Draft changed elsewhere"));
    await mount();
    await type("#copy-en", "New title");
    const save = button(t("platformAdmin.copyEditor.save"))!;
    expect(save.disabled).toBe(false);
    await click(save);
    expect(alert()).toContain(t("platformAdmin.copyEditor.conflict"));
    expect(refetch).toHaveBeenCalledTimes(1); // the stale revision is reconciled by reloading
    expect(button(t("platformAdmin.copyEditor.save"))!.disabled).toBe(false); // pending cleared: the admin can retry
  });

  it("retries the copy load from the load-error state, refetching the copy query", async () => {
    const refetch = vi.fn(async () => undefined);
    queries.state = { isPending: false, isError: true, isLoadingError: true, isFetching: false, data: undefined, refetch };
    queries.me = { data: session, isError: false, isLoadingError: false, refetch: vi.fn() };
    await mount();
    expect(alert()).toContain(t("platformAdmin.copyEditor.loadError"));
    await click(button(t("ui.retry"))!);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps Save disabled until a step-up is active, and re-disables it after the server refuses the write for a missing step-up", async () => {
    const refetch = vi.fn(async () => undefined);
    writable(refetch);
    vi.mocked(api).mockRejectedValueOnce(new ApiError(403, "STEP_UP_REQUIRED", "Step-up required"));
    await mount();
    await type("#copy-en", "New title");
    const save = button(t("platformAdmin.copyEditor.save"))!;
    expect(save.disabled).toBe(false); // the session carries a valid step-up
    await click(save);
    expect(alert()).toContain(t("platformAdmin.copyEditor.stepUp"));
    expect(queries.me.refetch).toHaveBeenCalledTimes(1); // the refusal re-reads the admin session
    expect(button(t("platformAdmin.copyEditor.save"))!.disabled).toBe(true); // and writes wait for a fresh step-up
    expect(refetch).not.toHaveBeenCalled(); // a step-up refusal never touched the draft, so no reload
  });

  it("shows the translated server error after a failed save, then clears it when Save is retried and succeeds", async () => {
    const refetch = vi.fn(async () => undefined);
    writable(refetch);
    vi.mocked(api).mockRejectedValueOnce(new ApiError(500, "INTERNAL", "boom")).mockResolvedValueOnce(undefined);
    await mount();
    await type("#copy-en", "New title");
    const save = () => button(t("platformAdmin.copyEditor.save"))!;
    expect(save().disabled).toBe(false);
    await click(save());
    expect(alert()).toContain(t("platformAdmin.copyEditor.serverError")); // translated, never the server's "boom"
    expect(refetch).toHaveBeenCalledTimes(1); // the write may have committed, so the state reloads
    expect(save().disabled).toBe(false); // pending cleared and the draft is still dirty: the admin can retry
    await click(save()); // the admin retries the same write
    expect(api).toHaveBeenCalledTimes(2);
    expect(alert()).toBe(""); // the earlier error is cleared
    expect(container.querySelector('[role="status"]')?.textContent).toBe(t("platformAdmin.copyEditor.saved"));
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(save().disabled).toBe(true); // the draft is clean again after the successful save
  });

  it("shows the translated server error after a failed publish, then clears it when Apply is retried and succeeds", async () => {
    const refetch = vi.fn(async () => undefined);
    writable(refetch);
    queries.state = { ...queries.state, data: { ...loaded, draft: { ...loaded.draft, value: { ar: {}, en: { "meta.title": "New" } }, revision: 2 } } };
    vi.mocked(api).mockRejectedValueOnce(new ApiError(500, "INTERNAL", "boom")).mockResolvedValueOnce(undefined);
    await mount();
    const apply = () => button(t("platformAdmin.copyEditor.apply"))!;
    expect(apply().disabled).toBe(false);
    await click(apply());
    expect(alert()).toContain(t("platformAdmin.copyEditor.serverError")); // translated, never the server's "boom"
    expect(refetch).toHaveBeenCalledTimes(1); // the publish may have committed, so the state reloads
    expect(apply().disabled).toBe(false);
    await click(apply()); // the admin retries
    expect(api).toHaveBeenCalledTimes(2);
    expect(alert()).toBe(""); // the earlier error is cleared
    expect(container.querySelector('[role="status"]')?.textContent).toBe(t("platformAdmin.copyEditor.applied"));
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("disables Save and re-reads the session, without reloading the copy, when the admin session expired", async () => {
    const refetch = vi.fn(async () => undefined);
    writable(refetch);
    vi.mocked(api).mockRejectedValueOnce(new ApiError(401, "PLATFORM_REAUTH_REQUIRED", "Sign in again"));
    await mount();
    await type("#copy-en", "New title");
    await click(button(t("platformAdmin.copyEditor.save"))!);
    expect(alert()).toContain(t("platformAdmin.copyEditor.reauthRequired"));
    expect(queries.me.refetch).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();
    expect(button(t("platformAdmin.copyEditor.save"))!.disabled).toBe(true);
  });

  it("keeps Save disabled while the copy state reloads after a failure", async () => {
    writable(vi.fn(async () => undefined));
    queries.state = { ...queries.state, isFetching: true };
    await mount();
    await type("#copy-en", "New title");
    expect(button(t("platformAdmin.copyEditor.save"))!.disabled).toBe(true);
  });

  it("disables Save when the session has no step-up yet", async () => {
    writable(vi.fn(async () => undefined));
    queries.me = { data: session, isError: false, isLoadingError: false, refetch: vi.fn() };
    await mount();
    await type("#copy-en", "New title");
    expect(button(t("platformAdmin.copyEditor.save"))!.disabled).toBe(true);
  });

  it("shows the serverError alert on failed Save (500), preserves typed text, and Dismiss clears the alert leaving edits intact", async () => {
    const refetch = vi.fn(async () => undefined);
    writable(refetch);
    vi.mocked(api).mockRejectedValueOnce(new ApiError(500, "INTERNAL", "boom"));
    await mount();
    await type("#copy-en", "New title preserved");
    const save = () => button(t("platformAdmin.copyEditor.save"))!;
    expect(save().disabled).toBe(false);
    await click(save());
    expect(alert()).toContain(t("platformAdmin.copyEditor.serverError"));
    expect(alert()).toContain(t("platformAdmin.copyEditor.dismiss"));
    expect(container.querySelector<HTMLTextAreaElement>("#copy-en")?.value).toBe("New title preserved");

    const dismissBtn = button(t("platformAdmin.copyEditor.dismiss"))!;
    expect(dismissBtn).toBeDefined();
    await click(dismissBtn);

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(alert()).toBe("");
    expect(container.querySelector<HTMLTextAreaElement>("#copy-en")?.value).toBe("New title preserved");
    expect(save().disabled).toBe(false);
  });

  it.each(["en", "ar"] as const)("shows the translated networkError text in %s on a network ApiError (status 0) and triggers refetchCopy", async (locale) => {
    const locT = createTranslator(locale);
    const refetch = vi.fn(async () => undefined);
    writable(refetch);
    vi.mocked(api).mockRejectedValueOnce(new ApiError(0, "NETWORK", "Can't reach Flowline"));
    await act(async () => {
      root.render(createElement(I18nProvider, { locale }, createElement(CopyEditor)));
    });
    const targetField = locale === "ar" ? "#copy-ar" : "#copy-en";
    await type(targetField, "New title");
    const saveBtn = button(locT("platformAdmin.copyEditor.save"))!;
    expect(saveBtn).toBeDefined();
    expect(saveBtn.disabled).toBe(false);
    await click(saveBtn);
    expect(alert()).toContain(locT("platformAdmin.copyEditor.networkError"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
