"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Select, Button, Card, Input, Textarea } from "@/components/ui";
import { useT } from "@/i18n/client";
import { ApiError, api } from "@/lib/api";

type Locale = "ar" | "en";
type Overrides = Record<Locale, Record<string, string>>;
interface State {
  base: Overrides;
  draft: { value: Overrides; revision: number; setAt: string | null };
  published: { value: Overrides; revision: number; setAt: string | null };
}
interface Me { csrfToken: string; stepUpUntil: string | null }

function effective(state: State, locale: Locale, key: string) {
  return state.draft.value[locale]?.[key] ?? state.base[locale]?.[key] ?? "";
}

export function CopyEditor() {
  const t = useT();
  const state = useQuery({ queryKey: ["platform-copy"], queryFn: () => api<State>("/api/platform/copy") });
  const { data: meData, refetch: refetchMe } = useQuery({ queryKey: ["platform-me"], queryFn: () => api<Me>("/api/platform/me"), refetchInterval: 30_000 });
  const [key, setKey] = useState("meta.title");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [edits, setEdits] = useState<Partial<Record<Locale, string>>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stepUpActive, setStepUpActive] = useState(false);
  const keys = useMemo(() => Object.keys(state.data?.base.ar ?? {}), [state.data]);
  const groups = useMemo(() => [...new Set(keys.map((item) => item.split(".")[0]!))], [keys]);
  const results = useMemo(() => keys.filter((item) => {
    if (group && item.split(".")[0] !== group) return false;
    const q = search.trim().toLocaleLowerCase();
    return !q || item.toLocaleLowerCase().includes(q) || (["ar", "en"] as const).some((locale) => effective(state.data!, locale, item).toLocaleLowerCase().includes(q));
  }), [keys, group, search, state.data]);

  const draft = state.data;
  const dirty = Boolean(draft && (["ar", "en"] as const).some((locale) => edits[locale] !== undefined && edits[locale] !== effective(draft, locale, key)));
  const publishedDifferent = Boolean(draft && JSON.stringify(draft.draft.value) !== JSON.stringify(draft.published.value));
  useEffect(() => {
    const expiresAt = meData?.stepUpUntil ? Date.parse(meData.stepUpUntil) : Number.NaN;
    const syncExpiry = () => {
      const active = Number.isFinite(expiresAt) && expiresAt > Date.now();
      setStepUpActive(active);
      if (!active && meData?.stepUpUntil) void refetchMe();
    };
    syncExpiry();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
    const timer = window.setTimeout(syncExpiry, expiresAt - Date.now());
    return () => window.clearTimeout(timer);
  }, [meData?.stepUpUntil, refetchMe]);

  const canWrite = stepUpActive && !pending;

  async function requireCurrentStepUp() {
    const expiresAt = meData?.stepUpUntil ? Date.parse(meData.stepUpUntil) : Number.NaN;
    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) return true;
    setStepUpActive(false);
    setMessage("");
    await refetchMe();
    setError(t("platformAdmin.copyEditor.stepUp"));
    return false;
  }

  async function handleWriteError(cause: unknown, fallbackKey: "platformAdmin.copyEditor.saveError" | "platformAdmin.copyEditor.publishError") {
    if (cause instanceof ApiError && cause.code === "STEP_UP_REQUIRED") {
      const refreshed = await refetchMe();
      const expiresAt = refreshed.data?.stepUpUntil ? Date.parse(refreshed.data.stepUpUntil) : Number.NaN;
      setStepUpActive(Number.isFinite(expiresAt) && expiresAt > Date.now());
      setError(t("platformAdmin.copyEditor.stepUp"));
      return;
    }
    await state.refetch();
    setError(t(fallbackKey));
  }

  async function save() {
    if (!draft || !meData || !dirty) return;
    if (!(await requireCurrentStepUp())) return;
    setPending(true);
    setError(""); setMessage("");
    try {
      const changes = (["ar", "en"] as const).filter((locale) => edits[locale] !== undefined && edits[locale] !== effective(draft, locale, key)).map((locale) => ({
        locale, key, value: edits[locale] === draft.base[locale][key] ? null : edits[locale]!,
      }));
      await api("/api/platform/copy", {
        method: "PATCH", headers: { "x-flowline-csrf": meData.csrfToken },
        json: { action: "edit", edits: changes, expectedRevision: draft.draft.revision },
      });
      await state.refetch();
      setEdits({});
      setMessage(t("platformAdmin.copyEditor.saved"));
    } catch (cause) {
      await handleWriteError(cause, "platformAdmin.copyEditor.saveError");
    } finally { setPending(false); }
  }

  async function publish() {
    if (!draft || !meData || dirty || !publishedDifferent) return;
    if (!(await requireCurrentStepUp())) return;
    setPending(true);
    setError(""); setMessage("");
    try {
      await api("/api/platform/copy", {
        method: "POST", headers: { "x-flowline-csrf": meData.csrfToken },
        json: { action: "publish", expectedDraftRevision: draft.draft.revision, expectedPublishedRevision: draft.published.revision },
      });
      await state.refetch();
      setMessage(t("platformAdmin.copyEditor.applied"));
    } catch (cause) {
      await handleWriteError(cause, "platformAdmin.copyEditor.publishError");
    } finally { setPending(false); }
  }

  return <div className="min-h-dvh bg-app text-hi">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
      <div>
        <Link href="/admin" className="text-sm text-accent-text hover:underline">{t("platformAdmin.copyEditor.back")}</Link>
        <h1 className="text-xl font-semibold">{t("platformAdmin.copyEditor.title")}</h1>
      </div>
      <LanguageSwitcher />
    </header>
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <p className="text-med">{t("platformAdmin.copyEditor.subtitle")}</p>
      {!stepUpActive && <p role="note" className="text-warning">{t("platformAdmin.copyEditor.stepUp")}</p>}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {message && <p role="status" className="text-success">{message}</p>}
      {state.isPending ? <p>{t("common.loading")}</p> : state.isError ? <p role="alert">{t("platformAdmin.copyEditor.loadError")}</p> : draft && <>
        <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
          <Card className="p-4">
            <label className="block text-sm font-medium" htmlFor="copy-search">{t("platformAdmin.copyEditor.search")}</label>
            <Input id="copy-search" value={search} onChange={(e) => setSearch(e.target.value)} className="mt-1" />
            <label className="mt-3 block text-sm font-medium" htmlFor="copy-group">{t("platformAdmin.copyEditor.group")}</label>
            <Select id="copy-group" value={group} onChange={(e) => setGroup(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface p-2">
              <option value="">{t("platformAdmin.copyEditor.allGroups")}</option>
              {groups.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <div className="mt-3 max-h-[32rem] overflow-auto">
              {results.length === 0 ? <p>{t("platformAdmin.copyEditor.empty")}</p> : <ul>
                {results.map((item) => <li key={item}>
                  <button type="button" disabled={pending} onClick={() => { if (dirty && !window.confirm(t("platformAdmin.copyEditor.discard"))) return; setEdits({}); setKey(item); setMessage(""); }} aria-pressed={key === item} className={`block w-full border-b border-line p-2 text-start text-sm hover:bg-surface ${key === item ? "bg-surface font-semibold" : ""}`}>
                    <span dir="ltr" className="block truncate font-mono text-xs text-muted">{item}</span>
                    <span className="block truncate" dir="rtl">{effective(draft, "ar", item)}</span>
                  </button>
                </li>)}
              </ul>}
            </div>
          </Card>
          <div className="space-y-4">
            <Card className="space-y-4 p-4">
              <h2 className="break-all font-mono text-sm" dir="ltr">{key}</h2>
              {key.startsWith("meta.") && <p className="text-sm text-med">{t("platformAdmin.copyEditor.metadata")}</p>}
              {(["ar", "en"] as const).map((locale) => <div key={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
                <label className="block text-sm font-medium" htmlFor={`copy-${locale}`}>{t(`platformAdmin.copyEditor.${locale === "ar" ? "arabic" : "english"}`)}</label>
                <Textarea id={`copy-${locale}`} disabled={pending} value={edits[locale] ?? effective(draft, locale, key)} onChange={(e) => setEdits((old) => ({ ...old, [locale]: e.target.value }))} rows={3} className="mt-1 w-full" />
                <button type="button" disabled={pending} onClick={() => setEdits((old) => ({ ...old, [locale]: draft.base[locale][key] ?? "" }))} className="mt-1 text-sm text-accent-text hover:underline">{t("platformAdmin.copyEditor.reset")}</button>
              </div>)}
              {dirty && <p role="status" className="text-sm text-warning">{t("platformAdmin.copyEditor.unsaved")}</p>}
              <Button onClick={save} disabled={!canWrite || !dirty}>{t("platformAdmin.copyEditor.save")}</Button>
            </Card>
            <Card className="space-y-3 p-4">
              <h2 className="font-semibold">{t("platformAdmin.copyEditor.preview")}</h2>
              <p className="text-sm text-med">{t("platformAdmin.copyEditor.previewNote")}</p>
              {(["ar", "en"] as const).map((locale) => <div key={locale} dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} className="rounded-lg border border-line bg-surface p-3">
                <p className="text-xs text-muted">{t(`platformAdmin.copyEditor.${locale === "ar" ? "arabic" : "english"}`)}</p>
                <p className="mt-2 text-lg font-medium break-words">{edits[locale] ?? effective(draft, locale, key)}</p>
              </div>)}
            </Card>
          </div>
        </div>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm text-med">{t("platformAdmin.copyEditor.draft")}: {draft.draft.revision} · {t("platformAdmin.copyEditor.published")}: {draft.published.revision}</div>
          <Button onClick={publish} disabled={!canWrite || dirty || !publishedDifferent}>{t("platformAdmin.copyEditor.apply")}</Button>
        </Card>
      </>}
    </main>
  </div>;
}
