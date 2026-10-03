"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button, Field, Input, Logo } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useT } from "@/i18n/client";
import { api } from "@/lib/api";

export default function FederatedStepUpPage() {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const challenge = useQuery({ queryKey: ["federated-step-up"], queryFn: () => api<{ csrf: string }>("/api/federation/step-up"), retry: false });
  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!challenge.data) return;
    const code = String(new FormData(e.currentTarget).get("code") ?? "").trim();
    e.currentTarget.reset();
    setPending(true); setError(false);
    try {
      const result = await api<{ next: string }>("/api/federation/step-up", { method: "POST", headers: { "content-type": "application/json", "x-flowline-csrf": challenge.data.csrf }, body: JSON.stringify({ code }) });
      window.location.assign(new URL(result.next, window.location.origin).href);
    } catch { setError(true); setPending(false); }
  }
  return <main className="flex min-h-dvh items-center justify-center px-4 py-10">
    <div className="w-full max-w-[400px] space-y-5">
      <div className="flex items-center justify-between"><Logo /><div className="flex gap-3"><LanguageSwitcher /><ThemeSwitcher /></div></div>
      <h1 className="text-2xl font-semibold">{t("auth.twoFactorTitle")}</h1>
      <p className="text-med">{t("auth.federatedFactorBody")}</p>
      {challenge.isError && <p role="alert" className="text-danger">{t("auth.federatedFactorExpired")}</p>}
      {error && <p role="alert" className="text-danger">{t("auth.twoFactorInvalid")}</p>}
      <form onSubmit={verify} className="space-y-4">
        <Field label={t("auth.twoFactorCode")} htmlFor="code"><Input id="code" name="code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></Field>
        <Button type="submit" variant="primary" loading={pending} disabled={!challenge.data}>{t("auth.twoFactorSubmit")}</Button>
      </form>
      <Link href="/sign-in" className="text-med">{t("auth.federatedFactorRestart")}</Link>
    </div>
  </main>;
}
