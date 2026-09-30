"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button, Card, Field, Input, Logo } from "@/components/ui";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/types";

type Mode = "verify" | "forgot" | "resend" | "reset" | "delete";
type Action = Mode | "deleteConfirm";

const STATE_KEYS: Record<string, MessageKey> = {
  invalid: "account.states.invalid",
  expired: "account.states.expired",
  used: "account.states.used",
  transfer_required: "account.states.transferRequired",
  rate: "account.states.rate",
  request: "account.states.noToken",
};

/** The account email pages (verify, forgot/reset password, resend verification, delete account). Copy: `account.*`. */
export function EmailFlow({ mode }: { mode: Mode }) {
  const t = useT();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const awaitingEmail = mode === "verify" && params.get("pending") === "1";
  const confirming = mode === "delete" && Boolean(token);
  const action: Action = confirming ? "deleteConfirm" : mode;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState("/sign-in");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (["verify", "reset", "deleteConfirm"].includes(action) && !token) return setState("request");
    setPending(true);
    setState(null);
    try {
      const response = await fetch("/api/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: action === "delete" ? "deleteRequest" : action, email, password, token, callbackURL: params.get("callbackURL") }) });
      const result = (await response.json()) as { status?: string; next?: string };
      if (result.next?.startsWith("/") && !result.next.startsWith("//")) setNextPath(result.next);
      setState(response.status === 429 ? "rate" : response.ok ? (result.status ?? "failed") : "failed");
    } catch {
      setState("failed");
    } finally {
      setPending(false);
    }
  }

  const success = state === "done" || state === "sent" || state === "sent_if_eligible";
  const message = success ? t(`account.${action}.done`) : state ? t(STATE_KEYS[state] ?? "account.states.failed") : null;
  // After verifying (or resetting), the next step is signing in — say so, and keep any `next` the link carried.
  const continueLabel = success && (action === "verify" || action === "reset") ? t("account.continueToSignIn") : t("account.backToSignIn");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" aria-label={t("common.homeAria")}>
            <Logo />
          </Link>
          <LanguageSwitcher />
        </div>
        <h1 className="mt-8 text-2xl font-semibold text-hi">{t(`account.${action}.title`)}</h1>
        <p className="mt-2 text-med">{awaitingEmail ? t("account.resend.done") : t(`account.${action}.prompt`)}</p>
        {!awaitingEmail && (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            {(action === "forgot" || action === "resend") && (
              <Field label={t("account.email")} htmlFor="email">
                <Input id="email" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            )}
            {action === "reset" && (
              <Field label={t("account.newPassword")} htmlFor="password">
                <Input id="password" type="password" dir="ltr" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            )}
            {message && (
              <p role="status" className={`rounded-md border px-3 py-2 ${success ? "border-success/40 text-success" : "border-danger/40 text-danger"}`}>
                {message}
              </p>
            )}
            <Button type="submit" variant="primary" loading={pending} disabled={success}>
              {t(`account.${action}.submit`)}
            </Button>
          </form>
        )}
        {awaitingEmail && (
          <Link href="/resend-verification" className="mt-6 inline-block text-accent-text hover:underline">
            {t("account.resend.title")}
          </Link>
        )}
        <p className="mt-6">
          <Link href={success ? nextPath : "/sign-in"} className="text-accent-text hover:underline">
            {continueLabel}
          </Link>
        </p>
      </Card>
    </main>
  );
}
