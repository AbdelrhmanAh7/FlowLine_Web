"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button, Field, Input, Logo } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useT } from "@/i18n/client";
import { api } from "@/lib/api";

export default function SsoLinkPage() {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [sent, setSent] = useState(false);
  const details = useQuery({ queryKey: ["sso-link"], queryFn: () => api<{ issuer: string; csrf: string; needsTotp: boolean; needsPassword: boolean; mailboxVerified: boolean }>("/api/sso/link"), retry: false });
  async function verifyMailbox() {
    if (!details.data) return;
    setPending(true); setError(false);
    try {
      await api("/api/sso/link", { method: "POST", headers: { "content-type": "application/json", "x-flowline-csrf": details.data.csrf }, body: JSON.stringify({ action: "verify-email" }) });
      setSent(true);
    } catch { setError(true); }
    setPending(false);
  }
  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!details.data) return;
    const values = new FormData(e.currentTarget);
    setPending(true); setError(false);
    try {
      const result = await api<{ next: string }>("/api/sso/link", { method: "POST", headers: { "content-type": "application/json", "x-flowline-csrf": details.data.csrf }, body: JSON.stringify({ confirm: true, ...(details.data.needsTotp ? { code: values.get("code") } : details.data.needsPassword ? { password: values.get("password") } : {}) }) });
      window.location.assign(new URL(result.next, window.location.origin).href);
    } catch { setError(true); setPending(false); }
  }
  return <main className="flex min-h-dvh items-center justify-center px-4 py-10">
    <div className="w-full max-w-[400px] space-y-5">
      <div className="flex items-center justify-between"><Logo /><div className="flex gap-3"><LanguageSwitcher /><ThemeSwitcher /></div></div>
      <h1 className="text-2xl font-semibold">{t("auth.ssoLinkTitle")}</h1>
      <p className="text-med">{t("auth.ssoLinkBody")}</p>
      {details.data && <p className="break-all data" dir="ltr">{details.data.issuer}</p>}
      {(error || details.isError) && <p role="alert" className="text-danger">{t("auth.ssoLinkError")}</p>}
      {details.data && !details.data.mailboxVerified && <div className="space-y-3">
        <p className="text-med">{t(sent ? "auth.ssoMailboxSent" : "auth.ssoMailboxBody")}</p>
        <Button onClick={verifyMailbox} loading={pending}>{t("auth.ssoMailboxVerify")}</Button>
        {sent && <Button onClick={() => void details.refetch()}>{t("auth.ssoMailboxRefresh")}</Button>}
      </div>}
      <form onSubmit={confirm} className="space-y-4">
        {details.data?.needsTotp ? <Field label={t("auth.twoFactorCode")} htmlFor="code"><Input id="code" name="code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></Field> : details.data?.needsPassword ? <Field label={t("auth.password")} htmlFor="password"><Input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" maxLength={128} required /></Field> : null}
        <Button type="submit" variant="primary" loading={pending} disabled={!details.data} disabledReason={details.data && !details.data.mailboxVerified ? t("auth.ssoMailboxRequired") : null}>{t("auth.ssoLinkConfirm")}</Button>
      </form>
      <Link href="/app" className="text-med">{t("auth.ssoLinkCancel")}</Link>
    </div>
  </main>;
}
