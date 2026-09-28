"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Input, Logo } from "@/components/ui";
import { emailCopy } from "./email-copy";

type Mode = "verify" | "forgot" | "resend" | "reset" | "delete";

export function EmailFlow({ mode, locale }: { mode: Mode; locale: "ar" | "en" }) {
  const copy = emailCopy[locale];
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const awaitingEmail = mode === "verify" && params.get("pending") === "1";
  const confirming = mode === "delete" && Boolean(token);
  const action = confirming ? "deleteConfirm" : mode;
  const item = copy[action];
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
      const response = await fetch("/api/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, email, password, token, callbackURL: params.get("callbackURL") }) });
      const result = await response.json() as { status?: string; next?: string };
      if (result.next?.startsWith("/") && !result.next.startsWith("//")) setNextPath(result.next);
      setState(response.status === 429 ? "rate" : response.ok ? result.status ?? "failed" : "failed");
    } catch { setState("failed"); }
    finally { setPending(false); }
  }

  const success = state === "done" || state === "sent" || state === "sent_if_eligible";
  const message = success ? item.done : state === "invalid" ? copy.invalid : state === "expired" ? copy.expired : state === "used" ? copy.used : state === "transfer_required" ? copy.transfer_required : state === "rate" ? copy.rate : state === "request" ? copy.request : state ? copy.failed : null;
  return <main dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
    <Card className="w-full max-w-md p-6 sm:p-8">
      <Link href="/" aria-label="Flowline"><Logo /></Link>
      <h1 className="mt-8 text-2xl font-semibold text-hi">{item.title}</h1>
      <p className="mt-2 text-med">{awaitingEmail ? copy.resend.done : item.prompt}</p>
      {!awaitingEmail && <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        {(action === "forgot" || action === "resend") && <Field label={copy.email} htmlFor="email"><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>}
        {action === "reset" && <Field label={copy.password} htmlFor="password"><Input id="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
        {message && <p role="status" className={`rounded-md border px-3 py-2 ${success ? "border-success/40 text-success" : "border-danger/40 text-danger"}`}>{message}</p>}
        <Button type="submit" variant="primary" loading={pending} disabled={success}>{item.submit}</Button>
      </form>}
      {awaitingEmail && <Link href="/resend-verification" className="mt-6 inline-block text-accent hover:underline">{copy.resend.title}</Link>}
      <Link href={success ? nextPath : "/sign-in"} className="mt-6 inline-block text-accent hover:underline">{copy.back}</Link>
    </Card>
  </main>;
}
