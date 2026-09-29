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
  const [error, setError] = useState<string | null>(params.get("sso_error") ?? (params.get("error") === "signin_expired" ? t("auth.signinExpired") : null));
  // Accounts with an authenticator (platform admins) finish sign-in with a TOTP code.
  const [twoFactor, setTwoFactor] = useState(false);
  const [pending, setPending] = useState(false);
  const [betaCode, setBetaCode] = useState("");
  const [notVerified, setNotVerified] = useState(false);
  // Sign-up never signs in: the account is activated from the emailed link. This holds the address we sent it to.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const config = useQuery({ queryKey: ["auth-config"], queryFn: () => api<{ google: boolean; github: boolean; betaMode?: "open" | "invite_only" }>("/api/auth-config") });
  const inviteOnly = mode === "sign-up" && config.data?.betaMode === "invite_only";
  const invited = next?.startsWith("invite:") ?? false;
  // Where the verification link continues to: sign-in, keeping `next` (e.g. an invitation) intact.
  const afterVerify = `/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  const destination = mode === "sign-up" ? `/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}` : `/app${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotVerified(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError(t("auth.errors.invalidEmail"));
    if (password.length < 8) return setError(t("auth.errors.passwordShort"));
    setPending(true);
    try {
      if (mode === "sign-up") {
        // Private beta: sign-up answers generically (no account enumeration), so ask first whether this email or
        // code can create an account — a refused person gets a clear reason instead of a "check your email" that
        // never arrives. The sign-up itself decides again and is the only thing that consumes a code.
        if (inviteOnly) {
          const check = await fetch("/api/beta/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code: betaCode.trim() || null }) });
          if (!check.ok) {
            setError(check.status === 429 ? t("auth.errors.betaRate") : t("errors.generic"));
            setPending(false);
            return;
          }
          if (!((await check.json()) as { allowed?: boolean }).allowed) {
            setError(t("auth.errors.betaRefused"));
            setPending(false);
            return;
          }
        }
        const body = { email, password, name: name.trim() || email.split("@")[0]!, callbackURL: afterVerify, ...(inviteOnly && betaCode.trim() ? { betaCode: betaCode.trim() } : {}) };
        const res = await authClient.signUp.email(body as Parameters<typeof authClient.signUp.email>[0]);
        if (res.error) {
          setError(friendly(t, res.error.message ?? res.error.statusText, res.error.status));
          setPending(false);
          return;
        }
        setSentTo(email.trim());
        setPending(false);
        return;
      }
      const res = await authClient.signIn.email({ email, password });
      if (!res.error && (res.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
        setTwoFactor(true);
        setPending(false);
        return;
      }
      if (res.error) {
        const unverified = res.error.status === 403 && /not verified/i.test(res.error.message ?? "");
        setNotVerified(unverified);
        setError(unverified ? t("auth.errors.notVerified") : friendly(t, res.error.message ?? res.error.statusText, res.error.status));
        setPending(false);
        return;
      }
      router.replace(destination);
      router.refresh();
    } catch {
      setError(t("errors.NETWORK"));
      setPending(false);
    }
  }

  async function verifyTotp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("totp") as HTMLInputElement | null;
    const code = (input?.value ?? "").trim();
    if (input) input.value = "";
    setError(null);
    setPending(true);
    const r = await fetch("/api/auth/two-factor/verify-totp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => null);
    if (!r?.ok) {
      setError(r ? t("auth.twoFactorInvalid") : t("errors.NETWORK"));
      setPending(false);
      return;
    }
    router.replace(destination);
    router.refresh();
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
          {invited && !sentTo && <p className="mt-2 text-base text-hi">{t("auth.inviteHint")}</p>}

          {twoFactor ? (
            <form onSubmit={verifyTotp} className="mt-8 flex flex-col gap-4" noValidate>
              <h2 className="text-lg font-semibold">{t("auth.twoFactorTitle")}</h2>
              <p className="text-base text-med">{t("auth.twoFactorBody")}</p>
              <Field label={t("auth.twoFactorCode")} htmlFor="totp">
                <Input id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" className="font-mono tracking-widest" />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" size="lg" loading={pending}>
                {t("auth.twoFactorSubmit")}
              </Button>
            </form>
          ) : sentTo ? (
            <CheckInbox email={sentTo} callbackURL={afterVerify} signInHref={afterVerify} onBack={() => setSentTo(null)} />
          ) : (
          <>
          {inviteOnly && (
            <p role="note" className="mt-6 rounded-md border border-line bg-surface px-3 py-2 text-base text-med">
              {t("auth.betaNotice")}
            </p>
          )}
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
            {inviteOnly && (
              <Field label={t("auth.betaCode")} htmlFor="beta-code" hint={t("auth.betaCodeHint")}>
                <Input id="beta-code" dir="ltr" className="data" autoComplete="off" spellCheck={false} placeholder="FL-XXXXXXXX" value={betaCode} onChange={(e) => setBetaCode(e.target.value)} maxLength={64} />
              </Field>
            )}
            {error && (
              <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-base text-danger">
                {error}
                {notVerified && (
                  <>
                    {" "}
                    <Link className="text-accent underline" href="/resend-verification">
                      {t("account.resend.title")}
                    </Link>
                  </>
                )}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" loading={pending}>
              {mode === "sign-up" ? t("auth.createAccount") : t("auth.signIn")}
            </Button>
          </form>

          {mode === "sign-in" && (
            <p className="mt-3 text-sm">
              <Link className="text-accent hover:underline" href="/forgot-password">
                {t("auth.forgot")}
              </Link>
            </p>
          )}

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
          </>
          )}
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

/** After sign-up: the account exists but stays inactive until the emailed link is opened. */
function CheckInbox({ email, callbackURL, signInHref, onBack }: { email: string; callbackURL: string; signInHref: string; onBack: () => void }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "rate" | "failed">("idle");
  async function resend() {
    setState("sending");
    try {
      const res = await fetch("/api/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resend", email, callbackURL }) });
      setState(res.status === 429 ? "rate" : res.ok ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  }
  return (
    <section aria-labelledby="check-inbox-title" className="mt-8 flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <h2 id="check-inbox-title" className="text-lg font-semibold text-hi">
        {t("auth.checkInbox.title")}
      </h2>
      <p className="text-base text-med">{t.rich("auth.checkInbox.body", { email: <strong dir="ltr" className="text-hi">{email}</strong> })}</p>
      <p className="text-sm text-muted">{t("auth.checkInbox.spam")}</p>
      {state !== "idle" && state !== "sending" && (
        <p role="status" className={state === "sent" ? "text-sm text-success" : "text-sm text-danger"}>
          {state === "sent" ? t("auth.checkInbox.resent") : state === "rate" ? t("auth.checkInbox.resendRate") : t("auth.checkInbox.resendFailed")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void resend()} loading={state === "sending"} disabledReason={state === "sent" ? t("auth.checkInbox.resent") : null}>
          {t("auth.checkInbox.resend")}
        </Button>
        <Link className="text-accent hover:underline" href={signInHref}>
          {t("auth.checkInbox.signIn")}
        </Link>
        <button type="button" onClick={onBack} className="text-base text-med hover:text-hi hover:underline">
          {t("auth.checkInbox.otherEmail")}
        </button>
      </div>
    </section>
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
