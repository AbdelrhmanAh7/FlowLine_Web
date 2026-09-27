"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, Logo } from "@/components/ui";

type Mode = "sign-in" | "sign-up";

export function AuthForm({ mode }: { mode: Mode }) {
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email address");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    setPending(true);
    try {
      const res =
        mode === "sign-up"
          ? await authClient.signUp.email({ email, password, name: name.trim() || email.split("@")[0]! })
          : await authClient.signIn.email({ email, password });
      if (res.error) {
        setError(friendly(res.error.message ?? res.error.statusText, res.error.status));
        setPending(false);
        return;
      }
      router.replace(destination);
      router.refresh();
    } catch {
      setError("Can't reach Flowline — check your connection and try again.");
      setPending(false);
    }
  }

  async function social(provider: "google" | "github") {
    await authClient.signIn.social({ provider, callbackURL: destination });
  }

  const oauthReason = (p: string, enabled?: boolean) =>
    config.isLoading ? "Checking sign-in options…" : enabled ? null : `${p} sign-in isn't configured on this server yet. Use email below.`;

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[400px]">
          <Link href="/" aria-label="Flowline home">
            <Logo />
          </Link>
          <h1 className="mt-10 text-2xl font-semibold tracking-tight">{mode === "sign-up" ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-1 text-base text-med">
            {mode === "sign-up" ? "Build and run flows on local nodes — no card required." : "Sign in to your workspace."}
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <Button size="lg" className="w-full" disabledReason={oauthReason("Google", config.data?.google)} onClick={() => social("google")}>
              <span aria-hidden className="font-semibold">G</span> Continue with Google
            </Button>
            <Button size="lg" className="w-full" disabledReason={oauthReason("GitHub", config.data?.github)} onClick={() => social("github")}>
              <span aria-hidden>◉</span> Continue with GitHub
            </Button>
          </div>

          <div className="my-6 flex items-center gap-3 text-sm text-muted">
            <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {mode === "sign-up" && (
              <Field label="Name" htmlFor="name">
                <Input id="name" autoComplete="name" placeholder="Jules Kim" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </Field>
            )}
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password" htmlFor="password" hint={mode === "sign-up" ? "At least 8 characters" : undefined}>
              <Input
                id="password"
                type="password"
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
              {mode === "sign-up" ? "Create account" : "Sign in"}
            </Button>
          </form>

          {mode === "sign-in" && (
            <>
              <div className="my-6 flex items-center gap-3 text-sm text-muted">
                <span className="h-px flex-1 bg-line" /> or with workspace SSO <span className="h-px flex-1 bg-line" />
              </div>
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const slug = ssoSlug.trim().toLowerCase();
                  if (!slug) return setError("Enter your workspace slug");
                  window.location.assign(new URL(`/api/sso/start?workspace=${encodeURIComponent(slug)}`, window.location.origin).href);
                }}
              >
                <div className="flex-1">
                  <Field label="Workspace slug" htmlFor="sso-slug">
                    <Input id="sso-slug" className="data" placeholder="acme" value={ssoSlug} onChange={(e) => setSsoSlug(e.target.value)} maxLength={60} />
                  </Field>
                </div>
                <Button type="submit">Sign in with SSO</Button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-base text-med">
            {mode === "sign-up" ? (
              <>
                Already have an account?{" "}
                <Link className="text-accent hover:underline" href={`/sign-in${next ? `?next=${next}` : ""}`}>
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New to Flowline?{" "}
                <Link className="text-accent hover:underline" href={`/sign-up${next ? `?next=${next}` : ""}`}>
                  Create an account
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
      <aside aria-hidden className="relative hidden overflow-hidden border-l border-line bg-surface lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(var(--color-elevated)_1px,transparent_1px)] [background-size:16px_16px] opacity-70" />
        <div className="relative flex h-full flex-col items-center justify-center gap-5 p-12">
          {[
            ["Manual trigger", "TRIGGER · MANUAL", "bg-success", false],
            ["Normalise lead", "TRANSFORM · JSONATA", "bg-success", true],
            ["Hot lead", "OUTPUT · RESULT", "bg-info", false],
          ].map(([t, s, dot, sel]) => (
            <div key={t as string} className={`w-64 rounded-lg border bg-card px-4 py-3 ${sel ? "border-accent shadow-[var(--shadow-glow)]" : "border-line"}`}>
              <p className="flex items-center gap-2 text-base font-semibold">
                <span className={`size-2 rounded-full ${dot}`} />
                {t}
              </p>
              <p className="data mt-0.5 text-xs text-muted">{s}</p>
            </div>
          ))}
          <p className="mt-4 max-w-xs text-center text-base text-med">Every run is stored step by step, so you can see exactly what happened.</p>
        </div>
      </aside>
    </div>
  );
}

function friendly(message: string, status: number) {
  if (status === 429) return "Too many attempts — wait a minute and try again.";
  // Server-side outage (e.g. the database is unreachable): say so plainly instead of "Internal Server Error".
  if (status >= 500) return "Flowline is temporarily unavailable on our side — nothing was saved. Try again in a moment.";
  if (/invalid email or password/i.test(message)) return "That email and password don't match.";
  if (/already exists|already in use/i.test(message)) return "An account with this email already exists. Sign in instead.";
  return message || "Something went wrong. Try again.";
}
