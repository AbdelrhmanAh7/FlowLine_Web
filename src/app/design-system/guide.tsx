"use client";

import { useT, I18nProvider } from "@/i18n/client";
import type { ar } from "@/i18n/messages/ar";
import { createTranslator } from "@/i18n/translate";
import { useState, type ReactNode } from "react";
import { Play } from "lucide-react";
import { contrastRatio } from "@/design/contrast";
import { primitiveHex, SEMANTIC, MOTION, type SemanticTheme, type ThemeName } from "@/design/tokens";
import { useToast } from "@/components/toast";
import {
  Badge, Button, Card, CategoryChip, ConfirmCheck, Dialog, Dot, Drawer, EmptyState, ErrorState, Field, IconButton, Input, Kbd, Logo,
  Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger, SectionLabel, Select,
  Skeleton, StatusBadge, TabPanel, Tabs, Textarea, Tooltip, UsageBar, cn, type Tone,
} from "@/components/ui";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { X } from "lucide-react";
import { FormPlayground } from "./form-playground";

/* ───────── Token tables (derived from the source of truth, src/design/tokens.ts) ───────── */

const GROUPS: { title: string; keys: (keyof SemanticTheme)[]; contrastOn?: keyof SemanticTheme }[] = [
  { title: "surfaces", keys: ["bg", "surface", "card", "elevated", "line", "line-strong"] },
  // Form-control boundary: WCAG 1.4.11 non-text contrast, 3:1 on every surface (the badge shows the ratio on `card`; the test checks all four).
  { title: "controlBorder", keys: ["line-control"], contrastOn: "card" },
  { title: "text", keys: ["text-hi", "text-med", "text-muted"], contrastOn: "bg" },
  { title: "accent", keys: ["accent", "accent-hover", "accent-press", "accent-text"], contrastOn: "bg" },
  { title: "status", keys: ["success", "warning", "danger", "info"], contrastOn: "bg" },
  { title: "nodeCategories", keys: ["cat-trigger", "cat-logic", "cat-ai", "cat-app", "cat-output"], contrastOn: "bg" },
  { title: "canvas", keys: ["canvas-dot", "minimap-node", "minimap-stroke"] },
];

const TONES: Tone[] = ["success", "warning", "danger", "info", "muted", "accent"];
const CATS = ["trigger", "logic", "ai", "app", "output"] as const;

function hex(theme: ThemeName, key: keyof SemanticTheme): string {
  const v = SEMANTIC[theme][key];
  return v.includes(".") ? primitiveHex(v as never) : v;
}

function TokenTable({ theme }: { theme: ThemeName }) {
  const t = useT();
  const onAccent = (["accent", "accent-hover", "accent-press"] as const).map((k) => ({ k, ratio: contrastRatio(hex(theme, "on-accent"), hex(theme, k)) }));
  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <div key={t(`designGuide.${g.title as keyof typeof ar.designGuide}`)}>
          <SectionLabel>{t(`designGuide.${g.title as keyof typeof ar.designGuide}`)}</SectionLabel>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {g.keys.map((k) => {
              const value = hex(theme, k);
              const isHex = value.startsWith("#");
              const ratio = g.contrastOn && isHex ? contrastRatio(value, hex(theme, g.contrastOn)) : null;
              return (
                <div key={k} className="overflow-hidden rounded-lg border border-line">
                  <div className="flex h-12 items-end justify-between p-1.5" style={{ background: `var(--${k})` }}>
                    {ratio && (
                      <span className="rounded bg-app/80 px-1 text-[10px] text-hi" title={t("designGuide.contrastOn", { token: g.contrastOn ?? "" })}>
                        {ratio.toFixed(2)} {ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA-large" : "✗"}
                      </span>
                    )}
                  </div>
                  <p className="truncate px-2 pt-1 text-xs font-medium">{k}</p>
                  <p className="data truncate px-2 pb-1.5 text-[10px] text-muted">{value}</p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div>
        <SectionLabel>{t("designGuide.textOnAccent")}</SectionLabel>
        <p className="mt-1 text-sm text-med">
          {t("designGuide.onAccent")} {onAccent.map(({ k, ratio }, i) => (
            <span key={k}>
              {i > 0 && " · "}
              {k}: <span className="data">{ratio.toFixed(2)}</span> {ratio >= 4.5 ? "AA" : t("designGuide.failsAA")}
            </span>
          ))}
        </p>
      </div>
      <div>
        <SectionLabel>{t("designGuide.motion")}</SectionLabel>
        <p className="data mt-1 text-sm text-med">
          {Object.entries(MOTION.duration).map(([k, v]) => `${k} ${v}ms`).join(" · ")} {t("designGuide.easings")} standard {`(${MOTION.easing.standard.join(", ")})`}, emphasized {`(${MOTION.easing.emphasized.join(", ")})`}, exit {`(${MOTION.easing.exit.join(", ")})`}
        </p>
      </div>
    </div>
  );
}

/* ───────── Component demos ───────── */

function Demo({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("flex flex-col gap-3 p-4", className)}>
      <SectionLabel>{title}</SectionLabel>
      {children}
    </Card>
  );
}

function ComponentDemos() {
  const t = useT();
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<"one" | "two">("one");
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Demo title={t("designGuide.button")}>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">{t("designGuide.primary")}</Button>
          <Button>{t("designGuide.secondary")}</Button>
          <Button variant="ghost">{t("designGuide.ghost")}</Button>
          <Button variant="danger">{t("designGuide.danger")}</Button>
          <Button variant="danger-ghost">{t("designGuide.dangerGhost")}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">{t("designGuide.small")}</Button>
          <Button loading>{t("designGuide.loading")}</Button>
          <Button confirm={confirmed} onClick={() => { setConfirmed(true); setTimeout(() => setConfirmed(false), 1400); }}>
            {confirmed ? "" : t("designGuide.clickConfirm")}
          </Button>
          <Button disabledReason="Disabled with a reason — shown on hover">{t("designGuide.disabled")}</Button>
          <IconButton aria-label={t("designGuide.closeDemo")}><X className="size-4" /></IconButton>
        </div>
      </Demo>

      <Demo title="Badge · StatusBadge · Dot · CategoryChip">
        <div className="flex flex-wrap items-center gap-2">
          {TONES.map((t) => <Badge key={t} tone={t}>{t}</Badge>)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {TONES.map((t) => <StatusBadge key={t} tone={t}>{t}</StatusBadge>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CATS.map((c) => <CategoryChip key={c} category={c}>{c}</CategoryChip>)}
        </div>
        <div className="flex items-center gap-2">
          {TONES.map((t) => <Dot key={t} tone={t} />)}
          <Kbd>⌘J</Kbd>
          <ConfirmCheck className="text-success" />
        </div>
      </Demo>

      <Demo title={t("designGuide.fields")}>
        <Field label={t("designGuide.name")} htmlFor="ds-name" hint={t("designGuide.fieldHint")}>
          <Input id="ds-name" placeholder={t("designGuide.typeHere")} />
        </Field>
        <Field label={t("designGuide.machineText")} htmlFor="ds-key">
          <Input id="ds-key" className="data" placeholder="fl_test_…" />
        </Field>
        <Field label={t("designGuide.pickOne")} htmlFor="ds-select">
          <Select id="ds-select" defaultValue="a">
            <option value="a">{t("designGuide.optionA")}</option>
            <option value="b">{t("designGuide.optionB")}</option>
          </Select>
        </Field>
        <Textarea placeholder={t("designGuide.textarea")} rows={2} />
        <Field label={t("designGuide.invalid")} htmlFor="ds-inv" error={t("designGuide.invalidValue")}>
          <Input id="ds-inv" invalid defaultValue={t("designGuide.badValue")} />
        </Field>
      </Demo>

      <Demo title={t("designGuide.overlays")}>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setDialogOpen(true)}>{t("designGuide.openDialog")}</Button>
          <Button size="sm" onClick={() => setDrawerOpen(true)}>{t("designGuide.openDrawer")}</Button>
          <Menu>
            <MenuTrigger asChild><Button size="sm">{t("designGuide.menu")}</Button></MenuTrigger>
            <MenuContent side="bottom">
              <MenuLabel>{t("designGuide.section")}</MenuLabel>
              <MenuItem>{t("designGuide.itemOne")}</MenuItem>
              <MenuItem>{t("designGuide.itemTwo")}</MenuItem>
              <MenuSeparator />
              <MenuItem danger>{t("designGuide.dangerItem")}</MenuItem>
            </MenuContent>
          </Menu>
          <Popover>
            <PopoverTrigger asChild><Button size="sm">{t("designGuide.popover")}</Button></PopoverTrigger>
            <PopoverContent className="w-56"><p className="text-sm text-med">{t("designGuide.popoverBody")}</p></PopoverContent>
          </Popover>
          <Tooltip content={t("designGuide.tooltip")} side="top"><Button size="sm">{t("designGuide.hoverMe")}</Button></Tooltip>
          <Button size="sm" onClick={() => toast(t("designGuide.toastBody"), "success")}>{t("designGuide.toast")}</Button>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen} title={t("designGuide.dialogTitle")} closeLabel={t("designGuide.close")}>
          <p className="mt-3 text-base text-med">{t("designGuide.dialogBody")}</p>
        </Dialog>
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title={t("designGuide.drawerTitle")} closeLabel={t("designGuide.close")}>
          <p className="p-5 text-base text-med">{t("designGuide.drawerBody")}</p>
        </Drawer>
      </Demo>

      <Demo title={t("designGuide.tabs")}>
        <Tabs tabs={[{ id: "one", label: t("designGuide.first") }, { id: "two", label: t("designGuide.second") }]} value={tab} onChange={setTab} label={t("designGuide.demoTabs")} className="flex-none">
          <TabPanel value="one" className="py-3 text-base text-med">{t("designGuide.firstPanel")}</TabPanel>
          <TabPanel value="two" className="py-3 text-base text-med">{t("designGuide.secondPanel")}</TabPanel>
        </Tabs>
      </Demo>

      <Demo title={t("designGuide.states")}>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-40" />
        </div>
        <UsageBar ratio={0.26} label={t("designGuide.usage26")} />
        <UsageBar ratio={0.8} label={t("designGuide.usage80")} />
        <UsageBar ratio={0.95} label={t("designGuide.usage95")} />
        <EmptyState icon={<Play className="size-6" />} title={t("designGuide.emptyTitle")} body={t("designGuide.emptyBody")} action={<Button size="sm">{t("designGuide.action")}</Button>} />
        <ErrorState title={t("designGuide.errorTitle")} body={t("designGuide.errorBody")} onRetry={() => {}} />
      </Demo>

      <Demo title={t("designGuide.brandPreferences")}>
        <Logo />
        <span className="bg-brand block size-8 rounded-md" aria-label={t("designGuide.brandSwatch")} />
        <ThemeSwitcher />
        <LanguageSwitcher />
      </Demo>
    </div>
  );
}

/* ───────── Motion primitives ───────── */

function MotionDemo({ cls, label, note }: { cls: string; label: string; note: string }) {
  const t = useT();
  const [n, setN] = useState(0);
  return (
    <div className="flex flex-col gap-2">
      <div key={n} className={cn("flex h-16 items-center justify-center rounded-lg border border-line bg-card text-sm text-med", cls)}>
        {label}
      </div>
      <p className="text-xs text-muted">{note}</p>
      <Button size="sm" className="self-start" onClick={() => setN((x) => x + 1)}>{t("designGuide.replay")}</Button>
    </div>
  );
}

function MotionDemos() {
  const t = useT();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MotionDemo cls="motion-enter" label="motion-enter" note={t("designGuide.motionEnter")} />
      <MotionDemo cls="motion-pop" label="motion-pop" note={t("designGuide.motionPop")} />
      <MotionDemo cls="motion-list-in" label="motion-list-in" note={t("designGuide.motionList")} />
      <MotionDemo cls="motion-confirm" label="motion-confirm" note={t("designGuide.motionConfirm")} />
      <MotionDemo cls="motion-shake" label="motion-shake" note={t("designGuide.motionShake")} />
      <MotionDemo cls="motion-running" label="motion-running" note={t("designGuide.motionRunning")} />
      <div className="flex flex-col gap-2">
        <div className="skeleton h-16" />
        <p className="text-xs text-muted">{t("designGuide.skeletonMotion")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="primary" className="h-16">{t("designGuide.pressMe")}</Button>
        <p className="text-xs text-muted">{t("designGuide.pressNote")}</p>
      </div>
    </div>
  );
}

/* ───────── Page ───────── */

function Panel({ theme, dir, lang, children }: { theme: ThemeName; dir: "ltr" | "rtl"; lang: "en" | "ar"; children: ReactNode }) {
  return (
    <div data-theme={theme} dir={dir} lang={lang} className="rounded-xl border border-line bg-app p-5 text-hi">
      <I18nProvider locale={lang}>{children}</I18nProvider>
    </div>
  );
}

export function Guide() {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10 sm:px-8">
      <header>
        <h1 className="text-2xl font-semibold">{t("designGuide.title")}</h1>
        <p className="mt-1 max-w-2xl text-base text-med">
          {t.rich("designGuide.introduction", { tokens: <code className="data" dir="ltr">src/design/tokens.ts</code>, reduced: <code className="data" dir="ltr">prefers-reduced-motion</code> })}
        </p>
      </header>

      <section>
        <h2 className="mb-4 text-xl font-semibold">{t("designGuide.tokensTitle")}</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel theme="dark" dir={t.locale === "ar" ? "rtl" : "ltr"} lang={t.locale}>
            <SectionLabel className="mb-3">{t("designGuide.dark")}</SectionLabel>
            <TokenTable theme="dark" />
          </Panel>
          <Panel theme="light" dir={t.locale === "ar" ? "rtl" : "ltr"} lang={t.locale}>
            <SectionLabel className="mb-3">{t("designGuide.light")}</SectionLabel>
            <TokenTable theme="light" />
          </Panel>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">{t("designGuide.componentsTitle")}</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel theme="dark" dir={t.locale === "ar" ? "rtl" : "ltr"} lang={t.locale}><ComponentDemos /></Panel>
          <Panel theme="light" dir={t.locale === "ar" ? "rtl" : "ltr"} lang={t.locale}><ComponentDemos /></Panel>
        </div>
      </section>

      <FormPlayground />

      <section>
        <h2 className="mb-4 text-xl font-semibold">{t("designGuide.directionsTitle")}</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel theme="dark" dir="ltr" lang="en">
            <SectionLabel className="mb-3">{t("designGuide.englishDirection")}</SectionLabel>
            <DirectionDemo />
          </Panel>
          <Panel theme="dark" dir="rtl" lang="ar">
            <SectionLabel className="mb-3">{t("designGuide.arabicDirection")}</SectionLabel>
            <DirectionDemo arabic />
          </Panel>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">{t("designGuide.motionTitle")}</h2>
        <p className="mb-4 max-w-2xl text-base text-med">
          {t.rich("designGuide.motionBody", { css: <code className="data" dir="ltr">globals.css</code> })}
        </p>
        <MotionDemos />
      </section>
    </div>
  );
}

function DirectionDemo({ arabic }: { arabic?: boolean }) {
  const t = createTranslator(arabic ? "ar" : "en");
  const toast = useToast();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary">{t("designGuide.runFlow")}</Button>
        <Button>{t("designGuide.save")}</Button>
        <Badge tone="success">{t("designGuide.succeeded")}</Badge>
        <Badge tone="danger">{t("designGuide.failed")}</Badge>
        <CategoryChip category="ai">{t("designGuide.ai")}</CategoryChip>
      </div>
      <Field label={t("designGuide.name")} htmlFor={arabic ? "ds-ar-name" : "ds-en-name"}>
        <Input id={arabic ? "ds-ar-name" : "ds-en-name"} placeholder={t("designGuide.typeHere")} />
      </Field>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => toast(t("designGuide.directionToast"), "info")}>
          {t("designGuide.toast")}
        </Button>
        <span className="text-sm text-muted">
          {t("designGuide.directionMachine")} <code className="data" dir="ltr">fl_test_9f27ac</code>
        </span>
      </div>
    </div>
  );
}
