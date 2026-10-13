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
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const cancel = () => {
    takeSecret(passwordRef.current);
    setAskPassword(false);
    setEnrolment(null);
  };

  const enable = async () => {
    const password = takeSecret(passwordRef.current) ?? "";
    setPending("enable");
    try {
      const r = await api<{ totpURI: string; backupCodes: string[] }>("/api/auth/two-factor/enable", { method: "POST", json: { password, issuer: "Flowline" } });
      setEnrolment({ totpURI: r.totpURI, secret: new URL(r.totpURI).searchParams.get("secret") ?? "", backupCodes: r.backupCodes });
      setAskPassword(false);
    } catch (err) {
      toast(err instanceof ApiError && (err.status === 400 || err.status === 401) ? t("account.security.twoFactor.passwordInvalid") : apiErrorMessage(t, err), "danger");
    } finally {
      setPending(null);
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
    setPending("verify");
    try {
      await api("/api/auth/two-factor/verify-totp", { method: "POST", json: { code } });
      setEnrolment(null);
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError && (err.status === 400 || err.status === 401) ? t("auth.twoFactorInvalid") : apiErrorMessage(t, err), "danger");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-medium text-hi">{t("account.security.twoFactor.title")}</h2>
        <span data-testid="two-factor-status">
          <StatusBadge tone={enabled ? "success" : "muted"}>{enabled ? t("account.security.twoFactor.on") : t("account.security.twoFactor.off")}</StatusBadge>
        </span>
      </div>
      {enabled ? null : enrolment ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            {/* <code> is not labelable, so the secret is named with aria-labelledby instead of a <label for>. */}
            <p id="two-factor-secret-label" className="text-xs font-medium uppercase tracking-[0.4px] text-med">
              {t("account.security.twoFactor.secret")}
            </p>
            <code
              id="two-factor-secret"
              aria-labelledby="two-factor-secret-label"
              dir="ltr"
              className="break-all rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-sm"
              data-testid="totp-secret"
            >
              {enrolment.secret}
            </code>
          </div>
          <div>
            <p className="text-sm text-warning">{t("account.security.twoFactor.backupCodes")}</p>
            <ul dir="ltr" className="mt-1 grid grid-cols-2 gap-1 font-mono text-sm" data-testid="backup-codes">
              {enrolment.backupCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            <Field label={t("auth.twoFactorCode")} htmlFor="two-factor-code">
              <Input ref={codeRef} id="two-factor-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" className="h-9 w-32 font-mono tracking-widest" />
            </Field>
            <Button type="submit" variant="primary" loading={pending === "verify"}>
              {t("account.security.twoFactor.confirm")}
            </Button>
            <Button type="button" onClick={cancel}>
              {t("account.security.twoFactor.cancel")}
            </Button>
          </form>
        </div>
      ) : askPassword ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void enable();
          }}
        >
          <Field label={t("account.security.twoFactor.password")} htmlFor="two-factor-password">
            <SecretInput ref={passwordRef} id="two-factor-password" maxLength={128} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={pending === "enable"}>
              {t("account.security.twoFactor.enable")}
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
