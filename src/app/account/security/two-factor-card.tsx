"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SecretInput, takeSecret } from "@/components/secret-input";
import { useToast } from "@/components/toast";
import { Button, Field, Input, StatusBadge } from "@/components/ui";
import { useT } from "@/i18n/client";
import { apiErrorMessage } from "@/i18n/errors";
import { api, ApiError } from "@/lib/api";

interface Enrolment {
  totpURI: string;
  secret: string;
  backupCodes: string[];
}

/** Two-step verification card: status, and the enrol flow (password -> secret + backup codes -> 6-digit code). The password is an uncontrolled SecretInput cleared on submit; the secret and codes live in state only until confirmed or cancelled. */
export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [askPassword, setAskPassword] = useState(false);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [pending, setPending] = useState<"enable" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secretVisible, setSecretVisible] = useState(true);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  // Bumped whenever an in-flight enable/verify is cancelled or replaced, so a late response can't reopen the secret.
  const requestRef = useRef(0);
  // AbortController for in-flight requests; aborted on cancel so late responses never resolve.
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = () => {
    requestRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    takeSecret(passwordRef.current);
    setError(null);
    setAskPassword(false);
    setEnrolment(null);
    setPending(null);
    setSecretVisible(true);
  };

  const enable = async () => {
    const req = ++requestRef.current;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const password = takeSecret(passwordRef.current) ?? "";
    setPending("enable");
    setError(null);
    try {
      const r = await api<{ totpURI: string; backupCodes: string[] }>("/api/auth/two-factor/enable", {
        method: "POST",
        json: { password, issuer: "Flowline" },
        signal: abortController.signal,
      });
      if (requestRef.current !== req) return;
      setEnrolment({
        totpURI: r.totpURI,
        secret: new URL(r.totpURI).searchParams.get("secret") ?? "",
        backupCodes: r.backupCodes,
      });
      setAskPassword(false);
    } catch (err) {
      if (requestRef.current !== req) return;
      // Only a wrong/missing password gets the friendly line; other failures show their own (or a generic) message.
      const msg =
        err instanceof ApiError && err.code === "INVALID_PASSWORD"
          ? t("account.security.twoFactor.passwordInvalid")
          : apiErrorMessage(t, err);
      setError(msg);
      toast(msg, "danger");
    } finally {
      if (requestRef.current === req) setPending(null);
      if (abortControllerRef.current === abortController) abortControllerRef.current = null;
    }
  };

  const verify = async () => {
    const code = (codeRef.current?.value ?? "").trim();
    if (codeRef.current) codeRef.current.value = "";
    // Never send an empty/partial verify request: a code is exactly 6 digits.
    if (!/^\d{6}$/.test(code)) {
      toast(t("auth.twoFactorInvalid"), "danger");
      return;
    }
    const req = ++requestRef.current;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setPending("verify");
    try {
      await api("/api/auth/two-factor/verify-totp", { method: "POST", json: { code }, signal: abortController.signal });
      if (requestRef.current !== req) return;
      setEnrolment(null);
      router.refresh();
    } catch (err) {
      if (requestRef.current !== req) return;
      toast(
        err instanceof ApiError && (err.status === 400 || err.status === 401)
          ? t("auth.twoFactorInvalid")
          : apiErrorMessage(t, err),
        "danger",
      );
    } finally {
      if (requestRef.current === req) setPending(null);
      if (abortControllerRef.current === abortController) abortControllerRef.current = null;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-medium text-hi">{t("account.security.twoFactor.title")}</h2>
        <span data-testid="two-factor-status" data-state={enabled ? "on" : "off"}>
          <StatusBadge tone={enabled ? "success" : "muted"}>
            {enabled ? t("account.security.twoFactor.on") : t("account.security.twoFactor.off")}
          </StatusBadge>
        </span>
      </div>
      {enabled ? null : enrolment ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 text-start" role="group" aria-labelledby="two-factor-secret-label">
            {/* <code> is not labelable, so the secret is named with aria-labelledby on the group container instead of a <label for>. */}
            <div className="flex items-center justify-between gap-2">
              <span id="two-factor-secret-label" className="text-xs font-medium text-med text-start">
                {t("account.security.twoFactor.secret")}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSecretVisible((v) => !v)}>
                {secretVisible ? t("account.security.twoFactor.hideSecret") : t("account.security.twoFactor.showSecret")}
              </Button>
            </div>
            {/* dir="ltr" is intentionally enforced for the manual TOTP secret even in RTL/Arabic contexts to prevent character transposition and ensure accurate copy/entry of ASCII keys. */}
            <code
              id="two-factor-secret"
              dir="ltr"
              className="data break-all rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-sm text-start"
              data-testid="totp-secret"
              aria-labelledby="two-factor-secret-label"
            >
              {secretVisible ? enrolment.secret : "••••••••••••••••"}
            </code>
          </div>
          <div className="text-start">
            <div className="flex items-center justify-between gap-2">
              <p data-testid="backup-codes-warning" className="text-sm text-warning text-start">
                {t("account.security.twoFactor.backupCodesWarning")}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    void navigator.clipboard.writeText(enrolment.backupCodes.join("\n"));
                  }
                  toast(t("account.security.twoFactor.backupCodesCopied"), "success");
                }}
              >
                {t("account.security.twoFactor.copyBackupCodes")}
              </Button>
            </div>
            {/* dir="ltr" is intentionally enforced for backup codes even in RTL/Arabic layouts so alphanumeric tokens are displayed in their authentic left-to-right order. */}
            <ul dir="ltr" className="mt-1 grid grid-cols-2 gap-1 font-mono text-sm text-start" data-testid="backup-codes">
              {enrolment.backupCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <form
            className="flex flex-wrap items-end gap-3 text-start"
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            {/* The 6-digit TOTP verification code is numeric and must be entered LTR across all locales. */}
            <Field label={t("account.security.twoFactor.codeLabel")} htmlFor="two-factor-code">
              <Input
                ref={codeRef}
                id="two-factor-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                dir="ltr"
                className="h-9 w-32 font-mono tracking-widest text-start"
              />
            </Field>
            <Button type="submit" variant="primary" loading={pending === "verify"}>
              {t("account.security.twoFactor.confirmButton")}
            </Button>
            {/* Once the code is submitted the server may already have turned MFA on, so Cancel would only hide that. */}
            <Button type="button" onClick={cancel} disabled={pending === "verify"}>
              {t("account.security.twoFactor.cancel")}
            </Button>
          </form>
        </div>
      ) : askPassword ? (
        <form
          className="flex flex-col gap-3 text-start"
          onSubmit={(e) => {
            e.preventDefault();
            void enable();
          }}
        >
          <Field label={t("account.security.twoFactor.password")} htmlFor="two-factor-password" error={error}>
            <SecretInput ref={passwordRef} id="two-factor-password" maxLength={128} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={pending === "enable"} data-testid="two-factor-submit">
              {t("account.security.twoFactor.submit")}
            </Button>
            <Button type="button" onClick={cancel}>
              {t("account.security.twoFactor.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button type="button" variant="primary" onClick={() => setAskPassword(true)}>
            {t("account.security.twoFactor.enable")}
          </Button>
        </div>
      )}
    </div>
  );
}
