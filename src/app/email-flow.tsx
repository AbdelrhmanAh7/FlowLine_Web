"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Card, DynamicForm, Logo, type DynamicFormField } from "@/components/ui";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/types";

type Mode = "verify" | "forgot" | "resend" | "reset" | "delete";
type Action = Mode | "deleteConfirm";
type AccountValues = { email: string; password: string };

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
  const [values, setValues] = useState<AccountValues>({ email: "", password: "" });
  const [state, setState] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState("/sign-in");
  const [pending, setPending] = useState(false);

  async function submit({ email, password }: AccountValues) {
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
  const fields: DynamicFormField<AccountValues>[] = [];
  if (action === "forgot" || action === "resend") fields.push({
    name: "email", id: "email", type: "email", label: t("account.email"), dir: "ltr", autoComplete: "email", required: true,
    startIcon: <Mail className="size-4" />, messages: { required: t("forms.required"), invalid: t("forms.emailInvalid") },
  });
  if (action === "reset") fields.push({
    name: "password", id: "password", type: "password", label: t("account.newPassword"), dir: "ltr", autoComplete: "new-password", required: true,
    startIcon: <LockKeyhole className="size-4" />, messages: { required: t("forms.required"), minLength: { value: 8, message: t("forms.passwordLength") }, maxLength: { value: 128, message: t("forms.passwordLength") } },
  });
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
          <DynamicForm fields={fields} values={values} onValuesChange={setValues} onSubmit={submit} pending={pending} submitDisabled={success} submitLabel={t(`account.${action}.submit`)} submitErrorMessage={t("account.states.failed")} submitIcon={<ShieldCheck className="size-4" />} className="mt-6">
            {message && (
              <p role="status" className={`rounded-md border px-3 py-2 ${success ? "border-success/40 text-success" : "border-danger/40 text-danger"}`}>
                {message}
              </p>
            )}
          </DynamicForm>
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
