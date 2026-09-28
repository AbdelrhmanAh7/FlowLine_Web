"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LOCAL_TEMPLATES } from "@/engine/templates";
import { api, ApiError } from "@/lib/api";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button, Field, Input, Logo, cx } from "@/components/ui";
import { useT } from "@/i18n/client";
import { apiErrorMessage } from "@/i18n/errors";
import type { MessageKey } from "@/i18n/types";

type Goal = "sales" | "support" | "data" | "engineering";
interface Ws {
  id: string;
  slug: string;
  name: string;
}

const GOALS: { id: Goal; icon: string }[] = [
  { id: "sales", icon: "📈" },
  { id: "support", icon: "🎧" },
  { id: "data", icon: "📊" },
  { id: "engineering", icon: "🛠" },
];

export function OnboardingWizard({ user, existingWorkspace }: { user: { name: string; email: string }; existingWorkspace: Ws | null }) {
  const t = useT();
  const router = useRouter();
  const [step, setStep] = useState(existingWorkspace ? 2 : 1);
  const [workspace, setWorkspace] = useState<Ws | null>(existingWorkspace);
  const [wsName, setWsName] = useState(() => {
    const first = user.name.split(" ")[0];
    return first ? t("onboarding.defaultWsName", { name: first }) : t("onboarding.fallbackWsName");
  });
  const [goal, setGoal] = useState<Goal | null>(null);
  const [choice, setChoice] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function ensureWorkspace(name = wsName): Promise<Ws> {
    if (workspace) return workspace;
    const { workspace: ws } = await api<{ workspace: Ws }>("/api/workspaces", { method: "POST", json: { name } });
    setWorkspace(ws);
    return ws;
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(apiErrorMessage(t, e));
    } finally {
      setBusy(null);
    }
  }

  const skip = () =>
    run("skip", async () => {
      const ws = await ensureWorkspace(wsName.trim().length >= 2 ? wsName : t("onboarding.fallbackWsName"));
      await api("/api/onboarding", { method: "POST", json: { goal, skipped: true } });
      router.replace(`/w/${ws.slug}/flows`);
    });

  // Template copy lives in the engine (English); the catalogue translates the built-in ones by id.
  const localText = (key: string, fallback: string) => (t.has(key) ? t(key as MessageKey) : fallback);

  const suggested = goal ? LOCAL_TEMPLATES.filter((t) => t.goal === goal) : [];
  const templates = [...suggested, ...LOCAL_TEMPLATES.filter((t) => !suggested.includes(t))];

  return (
    <div className="flex min-h-dvh flex-col bg-app">
      <header className="flex h-16 items-center justify-between px-4 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button variant="ghost" onClick={skip} loading={busy === "skip"}>
            {t("onboarding.skip")}
          </Button>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-[560px] rounded-xl border border-line bg-surface p-6 sm:p-10">
          <Progress step={step} />

          {step === 1 && (
            <form
              className="mt-8"
              onSubmit={(e) => {
                e.preventDefault();
                run("ws", async () => {
                  if (wsName.trim().length < 2) throw new ApiError(400, "VALIDATION", t("onboarding.wsNameShort"));
                  await ensureWorkspace();
                  setStep(2);
                });
              }}
            >
              <h1 className="text-xl font-semibold">{t("onboarding.step1Title")}</h1>
              <p className="mt-1 text-base text-med">{t("onboarding.step1Body")}</p>
              <div className="mt-6">
                <Field label={t("onboarding.wsNameLabel")} htmlFor="ws-name">
                  <Input id="ws-name" value={wsName} onChange={(e) => setWsName(e.target.value)} maxLength={60} autoFocus />
                </Field>
              </div>
              <ErrorLine error={error} />
              <div className="mt-8 flex gap-3">
                <Button variant="secondary" className="w-28" disabledReason={t("onboarding.firstStepReason")}>
                  {t("common.back")}
                </Button>
                <Button type="submit" variant="primary" className="flex-1" loading={busy === "ws"}>
                  {t("common.continue")}
                </Button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="mt-8">
              <h1 className="text-xl font-semibold">{t("onboarding.step2Title")}</h1>
              <p className="mt-1 text-base text-med">{t("onboarding.step2Body")}</p>
              <div role="radiogroup" aria-label={t("onboarding.goalAria")} className="mt-6 flex flex-col gap-3">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={goal === g.id}
                    onClick={() => setGoal(g.id)}
                    className={cx(
                      "flex items-start gap-3 rounded-lg border px-4 py-3 text-start transition-colors duration-[var(--dur-hover)]",
                      goal === g.id ? "border-accent bg-accent/10" : "border-line bg-card hover:bg-elevated",
                    )}
                  >
                    <span aria-hidden className="text-lg">{g.icon}</span>
                    <span>
                      <span className="block text-base font-semibold">{t(`onboarding.goals.${g.id}.title`)}</span>
                      <span className="block text-sm text-muted">{t(`onboarding.goals.${g.id}.body`)}</span>
                    </span>
                  </button>
                ))}
              </div>
              <ErrorLine error={error} />
              <div className="mt-8 flex gap-3">
                <Button variant="secondary" className="w-28" onClick={() => setStep(1)} disabledReason={existingWorkspace ? t("onboarding.alreadySetUp") : null}>
                  {t("common.back")}
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  disabledReason={goal ? null : t("onboarding.pickGoal")}
                  onClick={() => {
                    setChoice(LOCAL_TEMPLATES.find((t) => t.goal === goal)?.id ?? "blank");
                    setStep(3);
                  }}
                >
                  {t("common.continue")}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-8">
              <h1 className="text-xl font-semibold">{t("onboarding.step3Title")}</h1>
              <p className="mt-1 text-base text-med">{t("onboarding.step3Body")}</p>
              <div role="radiogroup" aria-label={t("onboarding.firstFlowAria")} className="mt-6 flex flex-col gap-3">
                {[
                  ...templates.map((tpl) => ({
                    id: tpl.id,
                    title: localText(`localTemplates.${tpl.id}.name`, tpl.name),
                    body: localText(`localTemplates.${tpl.id}.description`, tpl.description),
                    tag: suggested.includes(tpl) ? t("onboarding.suggested") : localText(`templateCategory.${tpl.category}`, tpl.category),
                  })),
                  { id: "blank", title: t("onboarding.blankTitle"), body: t("onboarding.blankBody"), tag: "" },
                ].map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={choice === o.id}
                    onClick={() => setChoice(o.id)}
                    className={cx(
                      "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-start transition-colors duration-[var(--dur-hover)]",
                      choice === o.id ? "border-accent bg-accent/10" : "border-line bg-card hover:bg-elevated",
                    )}
                  >
                    <span>
                      <span className="block text-base font-semibold">{o.title}</span>
                      <span className="block text-sm text-muted">{o.body}</span>
                    </span>
                    {o.tag && <span className="text-xs font-medium tracking-[0.4px] whitespace-nowrap text-accent uppercase">{o.tag}</span>}
                  </button>
                ))}
              </div>
              <ErrorLine error={error} />
              <div className="mt-8 flex gap-3">
                <Button variant="secondary" className="w-28" onClick={() => setStep(2)}>
                  {t("common.back")}
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  loading={busy === "finish"}
                  disabledReason={choice ? null : t("onboarding.pickStart")}
                  onClick={() =>
                    run("finish", async () => {
                      const ws = await ensureWorkspace();
                      const { flow } = await api<{ flow: { id: string } }>(`/api/workspaces/${ws.id}/flows`, {
                        method: "POST",
                        json: choice === "blank" ? { name: t("common.untitledFlow") } : { templateId: choice },
                      });
                      await api("/api/onboarding", { method: "POST", json: { goal, skipped: false } });
                      router.replace(`/w/${ws.slug}/flows/${flow.id}`);
                    })
                  }
                >
                  {t("onboarding.finish")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Progress({ step }: { step: number }) {
  const t = useT();
  return (
    <ol aria-label={t("onboarding.progress", { step })} className="flex items-center justify-center gap-2">
      {[1, 2, 3].map((n) => (
        <li key={n} className="flex items-center gap-2">
          <span
            aria-current={n === step ? "step" : undefined}
            className={cx(
              "data flex size-7 items-center justify-center rounded-full border text-sm transition-colors duration-[var(--dur-tab)]",
              n < step ? "border-success text-success" : n === step ? "border-accent bg-accent text-on-accent font-medium" : "border-line-strong text-muted",
            )}
          >
            {n < step ? "✓" : n}
          </span>
          {n < 3 && (
            <span className="relative h-px w-10 overflow-hidden bg-line-strong">
              <span className={cx("absolute inset-y-0 start-0 bg-success transition-[width] duration-[var(--dur-drawer)] ease-[var(--ease-out-expo)]", n < step ? "w-full" : "w-0")} />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-4 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-base text-danger">
      {error}
    </p>
  );
}
