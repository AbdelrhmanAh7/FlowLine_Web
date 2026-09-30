"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SecretInput, takeSecret } from "@/components/secret-input";
import { useToast } from "@/components/toast";
import { Button, ButtonLink, Card, Field, Input, Logo, Select, Skeleton, StatusBadge } from "@/components/ui";
import { useT } from "@/i18n/client";
import { apiErrorMessage } from "@/i18n/errors";
import { api, ApiError } from "@/lib/api";

interface SetupState {
  kind: "bootstrap" | "recovery" | "grant";
  email: string;
  expiresAt: string;
  emailConfigured: boolean;
  signedIn: boolean;
  signedInAsBound: boolean;
  signedInEmail: string | null;
  emailVerified: boolean;
  totpEnrolled: boolean;
}

const codeClass = "h-9 w-32 font-mono tracking-widest";

/** Every secret field here is uncontrolled and cleared right after it is read (success or failure). */
export function SetupFlow() {
  const t = useT();
  const toast = useToast();
  const state = useQuery({
    queryKey: ["platform-setup"],
    queryFn: async () => {
      try {
        return await api<SetupState>("/api/platform/setup");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
  const [pending, setPending] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [enrolment, setEnrolment] = useState<{ secret: string; backupCodes: string[] } | null>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const totpRef = useRef<HTMLInputElement>(null);
  const finalRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState<"resend" | "postmark">("resend");
  const [from, setFrom] = useState("");

  const run = async (id: string, fn: () => Promise<void>) => {
    setPending(id);
    try {
      await fn();
    } catch (err) {
      toast(apiErrorMessage(t, err), "danger");
    } finally {
      setPending(null);
    }
  };
  const code = (el: HTMLInputElement | null) => {
    const v = (el?.value ?? "").trim();
    if (el) el.value = "";
    return v;
  };

  const s = state.data;
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 py-10">
      <div className="flex items-center justify-between">
        <Logo />
        <LanguageSwitcher />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("platformAdmin.setup.title")}</h1>
      {state.isPending ? (
        <Skeleton className="h-40" />
      ) : done ? (
        <Card className="p-5">
          <p className="text-base">{t("platformAdmin.setup.done")}</p>
          <ButtonLink className="mt-4" variant="primary" href="/admin">
            {t("platformAdmin.setup.openPanel")}
          </ButtonLink>
        </Card>
      ) : !s ? (
        <Card className="p-5">
          <p className="text-base text-med">{t("platformAdmin.setup.intro")}</p>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const token = takeSecret(tokenRef.current) ?? "";
              void run("redeem", async () => {
                await api("/api/platform/setup/redeem", { method: "POST", json: { token: token.trim() } });
                await state.refetch();
              });
            }}
          >
            <Field label={t("platformAdmin.setup.codeLabel")} htmlFor="setup-token">
              <SecretInput ref={tokenRef} id="setup-token" maxLength={200} />
            </Field>
            <Button type="submit" variant="primary" loading={pending === "redeem"}>
              {t("platformAdmin.setup.redeem")}
            </Button>
          </form>
        </Card>
      ) : (
        <>
          <p className="text-base text-med">
            {t.rich("platformAdmin.setup.session", { email: <span dir="ltr" className="data">{s.email}</span> })}
          </p>

          <Card className="p-5">
            <h2 className="text-base font-semibold">{t("platformAdmin.setup.stepEmail")}</h2>
            {s.emailConfigured ? (
              <StatusBadge tone="success">{t("platformAdmin.setup.emailDone")}</StatusBadge>
            ) : (
              <>
                <p className="mt-1 text-sm text-med">{t.rich("platformAdmin.setup.stepEmailBody", { email: <span dir="ltr">{s.email}</span> })}</p>
                <form
                  className="mt-3 flex flex-col gap-3"
                  autoComplete="off"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const secret = takeSecret(keyRef.current) ?? "";
                    void run("email", async () => {
                      await api("/api/platform/setup/email", { method: "PUT", json: { provider, from: from.trim(), secret } });
                      await state.refetch();
                    });
                  }}
                >
                  <Field label={t("platformAdmin.setup.provider")} htmlFor="setup-provider">
                    <Select id="setup-provider" value={provider} onChange={(e) => setProvider(e.target.value as "resend" | "postmark")}>
                      <option value="resend">Resend</option>
                      <option value="postmark">Postmark</option>
                    </Select>
                  </Field>
                  <Field label={t("platformAdmin.setup.from")} htmlFor="setup-from">
                    <Input id="setup-from" dir="ltr" className="data" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Flowline <no-reply@example.com>" maxLength={300} />
                  </Field>
                  <Field label={t("platformAdmin.setup.key")} htmlFor="setup-key">
                    <SecretInput ref={keyRef} id="setup-key" maxLength={4096} />
                  </Field>
                  <Button type="submit" variant="primary" loading={pending === "email"}>
                    {t("platformAdmin.setup.saveEmail")}
                  </Button>
                </form>
              </>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold">{t.rich("platformAdmin.setup.stepSignIn", { email: <span dir="ltr">{s.email}</span> })}</h2>
            {!s.signedIn ? (
              <>
                <p className="mt-1 text-sm text-med">{t("platformAdmin.setup.stepSignInBody")}</p>
                <div className="mt-3 flex gap-2">
                  <ButtonLink href="/sign-in" target="_blank">
                    {t("platformAdmin.setup.signIn")}
                  </ButtonLink>
                  <ButtonLink href="/sign-up" target="_blank">
                    {t("platformAdmin.setup.signUp")}
                  </ButtonLink>
                  <Button onClick={() => state.refetch()}>{t("common.retry")}</Button>
                </div>
              </>
            ) : !s.signedInAsBound ? (
              <p className="mt-1 text-sm text-danger">{t("platformAdmin.setup.wrongAccount", { email: s.signedInEmail ?? "" })}</p>
            ) : !s.emailVerified ? (
              <p className="mt-1 text-sm text-warning">{t("platformAdmin.setup.verifyEmail")}</p>
            ) : (
              <StatusBadge tone="success">{t.rich("platformAdmin.setup.signedInAs", { email: <span dir="ltr">{s.email}</span> })}</StatusBadge>
            )}
          </Card>

          {s.signedInAsBound && s.emailVerified && (
            <Card className="p-5">
              <h2 className="text-base font-semibold">{t("platformAdmin.setup.stepTotp")}</h2>
              {s.totpEnrolled ? (
                <StatusBadge tone="success">{t("platformAdmin.setup.totpDone")}</StatusBadge>
              ) : !enrolment ? (
                <form
                  className="mt-3 flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const password = takeSecret(passwordRef.current) ?? "";
                    void run("enable", async () => {
                      const r = await api<{ totpURI: string; backupCodes: string[] }>("/api/auth/two-factor/enable", { method: "POST", json: { password, issuer: "Flowline" } });
                      const secret = new URL(r.totpURI).searchParams.get("secret") ?? "";
                      setEnrolment({ secret, backupCodes: r.backupCodes });
                    });
                  }}
                >
                  <p className="text-sm text-med">{t("platformAdmin.setup.stepTotpBody")}</p>
                  <Field label={t("platformAdmin.setup.password")} htmlFor="setup-password">
                    <SecretInput ref={passwordRef} id="setup-password" maxLength={128} />
                  </Field>
                  <Button type="submit" variant="primary" loading={pending === "enable"}>
                    {t("platformAdmin.setup.startTotp")}
                  </Button>
                </form>
              ) : (
                <div className="mt-3 flex flex-col gap-3">
                  <Field label={t("platformAdmin.setup.totpSecret")} htmlFor="setup-totp-secret">
                    <code id="setup-totp-secret" dir="ltr" className="break-all rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-sm" data-testid="totp-secret">
                      {enrolment.secret}
                    </code>
                  </Field>
                  <div>
                    <p className="text-sm text-warning">{t("platformAdmin.setup.backupCodes")}</p>
                    <ul dir="ltr" className="mt-1 grid grid-cols-2 gap-1 font-mono text-sm">
                      {enrolment.backupCodes.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                  <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const c = code(totpRef.current);
                      void run("verify", async () => {
                        await api("/api/auth/two-factor/verify-totp", { method: "POST", json: { code: c } });
                        setEnrolment(null);
                        await state.refetch();
                      });
                    }}
                  >
                    <Field label={t("platformAdmin.setup.totpCode")} htmlFor="setup-totp-code">
                      <Input ref={totpRef} id="setup-totp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" className={codeClass} />
                    </Field>
                    <Button type="submit" variant="primary" loading={pending === "verify"}>
                      {t("platformAdmin.setup.verifyTotp")}
                    </Button>
                  </form>
                </div>
              )}
            </Card>
          )}

          {s.signedInAsBound && s.emailVerified && s.totpEnrolled && (
            <Card className="p-5">
              <h2 className="text-base font-semibold">{t("platformAdmin.setup.stepComplete")}</h2>
              <p className="mt-1 text-sm text-med">{t("platformAdmin.setup.stepCompleteBody")}</p>
              <form
                className="mt-3 flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const c = code(finalRef.current);
                  void run("complete", async () => {
                    await api("/api/platform/setup/complete", { method: "POST", json: { code: c } });
                    setDone(true);
                  });
                }}
              >
                <Field label={t("platformAdmin.setup.totpCode")} htmlFor="setup-final-code">
                  <Input ref={finalRef} id="setup-final-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" className={codeClass} />
                </Field>
                <Button type="submit" variant="primary" loading={pending === "complete"}>
                  {t("platformAdmin.setup.complete")}
                </Button>
              </form>
            </Card>
          )}
          <p className="text-sm text-muted">
            <Link href="/" className="hover:underline">
              Flowline
            </Link>
          </p>
        </>
      )}
    </main>
  );
}
