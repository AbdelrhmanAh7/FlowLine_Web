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

/** Two-step verification card: status, the enrol flow (password -> secret + backup codes -> 6-digit code) and the disable flow (password only). Each password field is an uncontrolled SecretInput read through its own ref and cleared on submit; the secret and codes live in state only until confirmed or cancelled. */
export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [askPassword, setAskPassword] = useState(false);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [askDisable, setAskDisable] = useState(false);
  const [pending, setPending] = useState<"enable" | "verify" | "disable" | null>(null);
  const enablePasswordRef = useRef<HTMLInputElement>(null);
  const disablePasswordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const cancel = () => {
    takeSecret(enablePasswordRef.current);
    takeSecret(disablePasswordRef.current);
    if (codeRef.current) codeRef.current.value = "";
    setAskPassword(false);
    setAskDisable(false);
    setEnrolment(null);
  };

  const enable = async () => {
    const password = takeSecret(enablePasswordRef.current) ?? "";
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

  const disable = async () => {
    const password = takeSecret(disablePasswordRef.current) ?? "";
    setPending("disable");
    try {
      // better-auth disableTwoFactor accepts a POST JSON body with only the account password.
      await api("/api/auth/two-factor/disable", { method: "POST", json: { password } });
      setAskDisable(false);
      toast(t("account.security.twoFactor.disabled"), "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError && (err.status === 400 || err.status === 401) ? t("account.security.twoFactor.passwordInvalid") : apiErrorMessage(t, err), "danger");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-medium text-hi">{t("account.security.twoFactor.title")}</h2>
        <StatusBadge tone={enabled ? "success" : "muted"}>{enabled ? t("account.security.twoFactor.on") : t("account.security.twoFactor.off")}</StatusBadge>
      </div>
      {enabled ? (
        askDisable ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void disable();
            }}
          >
            <p className="text-sm text-med">{t("account.security.twoFactor.disableBody")}</p>
            <Field label={t("account.security.twoFactor.password")} htmlFor="two-factor-disable-password">
              <SecretInput ref={disablePasswordRef} id="two-factor-disable-password" maxLength={128} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" loading={pending === "disable"}>
                {t("account.security.twoFactor.disable")}
              </Button>
              <Button type="button" onClick={cancel}>{t("account.security.twoFactor.cancel")}</Button>
            </div>
          </form>
        ) : (
          <div>
            <Button onClick={() => setAskDisable(true)}>{t("account.security.twoFactor.disable")}</Button>
          </div>
        )
      ) : enrolment ? (
        <div className="flex flex-col gap-3">
          <Field label={t("account.security.twoFactor.secret")} htmlFor="two-factor-secret">
            <code id="two-factor-secret" dir="ltr" className="break-all rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-sm" data-testid="totp-secret">
              {enrolment.secret}
            </code>
          </Field>
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
            <Button type="button" onClick={cancel}>{t("account.security.twoFactor.cancel")}</Button>
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
            <SecretInput ref={enablePasswordRef} id="two-factor-password" maxLength={128} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={pending === "enable"}>
              {t("account.security.twoFactor.enable")}
            </Button>
            <Button type="button" onClick={cancel}>{t("account.security.twoFactor.cancel")}</Button>
          </div>
        </form>
      ) : (
        <div>
          <Button variant="primary" onClick={() => setAskPassword(true)}>
            {t("account.security.twoFactor.enable")}
          </Button>
        </div>
      )}
    </div>
  );
}
