"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button, Field, Input, Logo } from "@/components/ui";
import { useT } from "@/i18n/client";
import type { Translator } from "@/i18n/translate";

type Mode = "sign-in" | "sign-up";

export function AuthForm({ mode }: { mode: Mode }) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [ssoSlug, setSsoSlug] = useState("");
  const [error, setError] = useState<string | null>(params.get("sso_error"));
  const [pending, setPending] = useState(false);
  const config = useQuery({ queryKey: ["auth-config"], queryFn: () => api<{ google: boolean; github: boolean }>("/api/auth-config") });

  const destination = mode === "sign-up" ? `/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}` : `/app${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError(t("auth.errors.invalidEmail"));
    if (password.length < 8) return setError(t("auth.errors.passwordShort"));
    setPending(true);
    try {
      const res =
        mode === "sign-up"
          ? await authClient.signUp.email({ email, password, name: name.trim() || email.split("@")[0]! })
          : await authClient.signIn.email({ email, password });
      if (res.error) {
        setError(friendly(t, res.error.message ?? res.error.statusText, res.error.status));
        setPending(false);
        return;
      }
      router.replace(mode === "sign-up" ? "/verify-email?pending=1" : destination);
      router.refresh();
    } catch {
      setError(t("errors.NETWORK"));
      setPending(false);
    }
  }

  async function social(provider: "google" | "github") {
    await authClient.signIn.social({ provider, callbackURL: destination });
  }

  const oauthReason = (p: string, enabled?: boolean) =>
    config.isLoading ? t("auth.checkingOptions") : enabled ? null : t("auth.oauthNotConfigured", { provider: p });

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" aria-label={t("common.homeAria")}>
              <Logo />
            </Link>
            <LanguageSwitcher />
          </div>
          <h1 className="mt-10 text-2xl font-semibold tracking-tight">{mode === "sign-up" ? t("auth.signUpTitle") : t("auth.signInTitle")}</h1>
          <p className="mt-1 text-base text-med">
            {mode === "sign-up" ? t("auth.signUpSub") : t("auth.signInSub")}
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <Button size="lg" className="w-full" disabledReason={oauthReason("Google", config.data?.google)} onClick={() => social("google")}>
              <span aria-hidden className="font-semibold">G</span> {t("auth.google")}
            </Button>
            <Button size="lg" className="w-full" disabledReason={oauthReason("GitHub", config.data?.github)} onClick={() => social("github")}>
              <span aria-hidden>◉</span> {t("auth.github")}
            </Button>
          </div>

          <div className="my-6 flex items-center gap-3 text-sm text-muted">
            <span className="h-px flex-1 bg-line" /> {t("auth.orEmail")} <span className="h-px flex-1 bg-line" />
          </div>

          {/* Before hydration a submit falls back to a POST with unnamed fields: nothing typed ever lands in a URL. */}
          <form method="post" onSubmit={submit} noValidate className="flex flex-col gap-4">
            {mode === "sign-up" && (
              <Field label={t("auth.name")} htmlFor="name">
                <Input id="name" autoComplete="name" placeholder={t("auth.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </Field>
            )}
            <Field label={t("auth.email")} htmlFor="email">
              <Input id="email" type="email" dir="ltr" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label={t("auth.password")} htmlFor="password" hint={mode === "sign-up" ? t("auth.passwordHint") : undefined}>
              <Input
                id="password"
                type="password"
                dir="ltr"
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {error && (
              <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-base text-danger">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" loading={pending}>
              {mode === "sign-up" ? t("auth.createAccount") : t("auth.signIn")}
            </Button>
          </form>

          {mode === "sign-in" && <p className="mt-3 text-sm"><Link className="text-accent hover:underline" href="/forgot-password">نسيت كلمة المرور؟ / Forgot password?</Link></p>}

          {mode === "sign-in" && (
            <>
              <div className="my-6 flex items-center gap-3 text-sm text-muted">
                <span className="h-px flex-1 bg-line" /> {t("auth.orSso")} <span className="h-px flex-1 bg-line" />
              </div>
              {/* Works before hydration too: a plain GET to the SSO start endpoint. */}
              <form
                action="/api/sso/start"
                method="get"
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const slug = ssoSlug.trim().toLowerCase();
                  if (!slug) return setError(t("auth.errors.ssoSlugRequired"));
                  window.location.assign(new URL(`/api/sso/start?workspace=${encodeURIComponent(slug)}`, window.location.origin).href);
                }}
              >
                <div className="flex-1">
                  <Field label={t("auth.ssoSlug")} htmlFor="sso-slug">
                    <Input id="sso-slug" name="workspace" dir="ltr" className="data" placeholder="acme" value={ssoSlug} onChange={(e) => setSsoSlug(e.target.value)} maxLength={60} />
                  </Field>
                </div>
                <Button type="submit">{t("auth.ssoButton")}</Button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-base text-med">
            {mode === "sign-up" ? (
              <>
                {t("auth.haveAccount")}{" "}
                <Link className="text-accent hover:underline" href={`/sign-in${next ? `?next=${next}` : ""}`}>
                  {t("auth.signInLink")}
                </Link>
              </>
            ) : (
              <>
                {t("auth.newHere")}{" "}
                <Link className="text-accent hover:underline" href={`/sign-up${next ? `?next=${next}` : ""}`}>
                  {t("auth.createLink")}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
      <aside aria-hidden className="relative hidden overflow-hidden border-s border-line bg-surface lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(var(--color-elevated)_1px,transparent_1px)] [background-size:16px_16px] opacity-70" />
        <div className="relative flex h-full flex-col items-center justify-center gap-5 p-12">
          {[
            [t("auth.asideNodes.trigger"), "TRIGGER · MANUAL", "bg-success", false],
            [t("auth.asideNodes.transform"), "TRANSFORM · JSONATA", "bg-success", true],
            [t("auth.asideNodes.output"), "OUTPUT · RESULT", "bg-info", false],
          ].map(([t, s, dot, sel]) => (
            <div key={t as string} className={`w-64 rounded-lg border bg-card px-4 py-3 ${sel ? "border-accent shadow-[var(--shadow-glow)]" : "border-line"}`}>
              <p className="flex items-center gap-2 text-base font-semibold">
                <span className={`size-2 rounded-full ${dot}`} />
                {t}
              </p>
              <p className="data mt-0.5 text-xs text-muted">{s}</p>
            </div>
          ))}
          <p className="mt-4 max-w-xs text-center text-base text-med">{t("auth.asideCaption")}</p>
        </div>
      </aside>
    </div>
  );
}

/** Auth-library errors → a line in the UI language (the library's own message is the fallback). */
function friendly(t: Translator, message: string, status: number) {
  if (status === 429) return t("errors.RATE_LIMITED");
  // Server-side outage (e.g. the database is unreachable): say so plainly instead of "Internal Server Error".
  if (status >= 500) return t("errors.server");
  if (/invalid email or password/i.test(message)) return t("auth.errors.badCredentials");
  if (/already exists|already in use/i.test(message)) return t("auth.errors.exists");
  return message || t("errors.generic");
}
