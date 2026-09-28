"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckoutPageState } from "@/billing/checkout-page";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button, ButtonLink, Card, ErrorState, Spinner, StatusBadge } from "@/components/ui";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/types";

type Ready = Extract<CheckoutPageState, { kind: "ready" }>;

/** The subset of Paddle.js v2 this page uses (developer.paddle.com/paddlejs). */
interface PaddleJs {
  Environment: { set(env: "sandbox"): void };
  Initialize(opts: { token: string; eventCallback?: (event: { name?: string }) => void }): void;
  Checkout: { open(opts: { transactionId: string; settings?: { displayMode?: "overlay"; locale?: string; successUrl?: string } }): void };
}

declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

type Phase = "loading" | "open" | "closed" | "completed" | "load_error" | "open_error";

// Paddle.Initialize may be called once per page; the event handler is swapped per mount instead.
let initializedWith: string | null = null;
let onPaddleEvent: (event: { name?: string }) => void = () => {};

const MESSAGES: Record<Exclude<CheckoutPageState["kind"], "ready">, { title: MessageKey; body: MessageKey }> = {
  forbidden: { title: "billingCheckout.forbiddenTitle", body: "settings.billing.ownerOnly" },
  invalid_transaction: { title: "billingCheckout.invalidTitle", body: "billingCheckout.invalidBody" },
  not_configured: { title: "billingCheckout.notConfiguredTitle", body: "billingCheckout.notConfiguredBody" },
  live_token_refused: { title: "billingCheckout.notConfiguredTitle", body: "billingCheckout.liveRefusedBody" },
  token_env_mismatch: { title: "billingCheckout.notConfiguredTitle", body: "billingCheckout.envMismatchBody" },
  invalid_token: { title: "billingCheckout.notConfiguredTitle", body: "billingCheckout.invalidTokenBody" },
};

export function PaddleCheckout({ state }: { state: CheckoutPageState }) {
  const t = useT();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-app p-4">
      <Card className="w-full max-w-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{t("billingCheckout.title")}</h1>
            <p className="mt-1 text-sm text-muted">{t("billingCheckout.workspace", { name: state.workspaceName })}</p>
          </div>
          <LanguageSwitcher />
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {state.kind === "ready" ? (
            <ReadyCheckout state={state} />
          ) : (
            <ErrorState title={t(MESSAGES[state.kind].title)} body={t(MESSAGES[state.kind].body)} />
          )}
          <ButtonLink href={state.settingsPath} className="self-start">
            {t("billingCheckout.backToSettings")}
          </ButtonLink>
        </div>
      </Card>
    </main>
  );
}

function ReadyCheckout({ state }: { state: Ready }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("loading");
  const [attempt, setAttempt] = useState(0);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  const openCheckout = useCallback(() => {
    const paddle = window.Paddle;
    if (!paddle) {
      setPhase("load_error");
      return;
    }
    try {
      onPaddleEvent = (event) => {
        if (event?.name === "checkout.loaded") setPhase("open");
        else if (event?.name === "checkout.completed") setPhase("completed");
        else if (event?.name === "checkout.closed") setPhase((p) => (p === "completed" ? p : "closed"));
      };
      if (initializedWith !== state.token) {
        if (state.environment === "sandbox") paddle.Environment.set("sandbox");
        paddle.Initialize({ token: state.token, eventCallback: (event) => onPaddleEvent(event) });
        initializedWith = state.token;
      }
      // An explicit open takes priority over Paddle.js's own `_ptxn` detection.
      paddle.Checkout.open({ transactionId: state.transactionId, settings: { displayMode: "overlay", locale: t.locale, successUrl: state.successUrl } });
      setPhase((p) => (p === "loading" || p === "closed" ? "open" : p));
    } catch {
      setPhase("open_error");
    }
  }, [state, t.locale]);

  useEffect(() => {
    if (window.Paddle) {
      // Already loaded (retry or client navigation): open on the next tick, like the onload path.
      const timer = window.setTimeout(openCheckout, 0);
      return () => window.clearTimeout(timer);
    }
    const script = document.createElement("script");
    script.src = state.scriptUrl;
    script.async = true;
    script.onload = () => openCheckout();
    script.onerror = () => {
      script.remove();
      setPhase("load_error");
    };
    scriptRef.current = script;
    document.head.appendChild(script);
    return () => {
      script.onload = null;
      script.onerror = null;
    };
  }, [attempt, openCheckout, state.scriptUrl]);

  const retry = () => {
    scriptRef.current?.remove();
    setPhase("loading");
    setAttempt((n) => n + 1);
  };

  return (
    <>
      {state.environment === "sandbox" && (
        <div className="flex flex-col items-start gap-1.5 rounded-md border border-warning/40 bg-warning/5 px-3 py-2">
          <StatusBadge tone="warning">{t("billingCheckout.sandboxBadge")}</StatusBadge>
          <p className="text-sm text-med">{t("billingCheckout.sandboxNote")}</p>
        </div>
      )}
      {phase === "loading" && (
        <p role="status" className="flex items-center gap-2 text-base text-med">
          <Spinner />
          {t("billingCheckout.loading")}
        </p>
      )}
      {phase === "open" && (
        <p role="status" className="text-base text-med">
          {t("billingCheckout.open")}
        </p>
      )}
      {phase === "completed" && (
        <p role="status" className="text-base text-med">
          {t("billingCheckout.completed")}
        </p>
      )}
      {phase === "closed" && (
        <>
          <p role="status" className="text-base text-med">
            {t("billingCheckout.closed")}
          </p>
          <Button variant="primary" className="self-start" onClick={openCheckout}>
            {t("billingCheckout.reopen")}
          </Button>
        </>
      )}
      {phase === "load_error" && <ErrorState title={t("billingCheckout.loadErrorTitle")} body={t("billingCheckout.loadErrorBody")} onRetry={retry} />}
      {phase === "open_error" && <ErrorState title={t("billingCheckout.openErrorTitle")} body={t("billingCheckout.openErrorBody")} onRetry={openCheckout} />}
    </>
  );
}
