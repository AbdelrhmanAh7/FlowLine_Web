"use client";

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

/* ───────── Token tables (derived from the source of truth, src/design/tokens.ts) ───────── */

const GROUPS: { title: string; keys: (keyof SemanticTheme)[]; contrastOn?: keyof SemanticTheme }[] = [
  { title: "Surfaces", keys: ["bg", "surface", "card", "elevated", "line", "line-strong"] },
  // Form-control boundary: WCAG 1.4.11 non-text contrast, 3:1 on every surface (the badge shows the ratio on `card`; the test checks all four).
  { title: "Control border (input, textarea, select)", keys: ["line-control"], contrastOn: "card" },
  { title: "Text", keys: ["text-hi", "text-med", "text-muted"], contrastOn: "bg" },
  { title: "Accent (fill · text)", keys: ["accent", "accent-hover", "accent-press", "accent-text"], contrastOn: "bg" },
  { title: "Status", keys: ["success", "warning", "danger", "info"], contrastOn: "bg" },
  { title: "Node categories", keys: ["cat-trigger", "cat-logic", "cat-ai", "cat-app", "cat-output"], contrastOn: "bg" },
  { title: "Canvas", keys: ["canvas-dot", "minimap-node", "minimap-stroke"] },
];

const TONES: Tone[] = ["success", "warning", "danger", "info", "muted", "accent"];
const CATS = ["trigger", "logic", "ai", "app", "output"] as const;

function hex(theme: ThemeName, key: keyof SemanticTheme): string {
  const v = SEMANTIC[theme][key];
  return v.includes(".") ? primitiveHex(v as never) : v;
}

function TokenTable({ theme }: { theme: ThemeName }) {
  const onAccent = (["accent", "accent-hover", "accent-press"] as const).map((k) => ({ k, ratio: contrastRatio(hex(theme, "on-accent"), hex(theme, k)) }));
  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <SectionLabel>{g.title}</SectionLabel>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {g.keys.map((k) => {
              const value = hex(theme, k);
              const isHex = value.startsWith("#");
              const ratio = g.contrastOn && isHex ? contrastRatio(value, hex(theme, g.contrastOn)) : null;
              return (
                <div key={k} className="overflow-hidden rounded-lg border border-line">
                  <div className="flex h-12 items-end justify-between p-1.5" style={{ background: `var(--${k})` }}>
                    {ratio && (
                      <span className="rounded bg-app/80 px-1 text-[10px] text-hi" title={`Contrast on ${g.contrastOn}`}>
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
        <SectionLabel>Text on accent button</SectionLabel>
        <p className="mt-1 text-sm text-med">
          on-accent on {onAccent.map(({ k, ratio }, i) => (
            <span key={k}>
              {i > 0 && " · "}
              {k}: <span className="data">{ratio.toFixed(2)}</span> {ratio >= 4.5 ? "AA" : "FAILS AA"}
            </span>
          ))}
        </p>
      </div>
      <div>
        <SectionLabel>Motion</SectionLabel>
        <p className="data mt-1 text-sm text-med">
          {Object.entries(MOTION.duration).map(([k, v]) => `${k} ${v}ms`).join(" · ")} — easings: standard {`(${MOTION.easing.standard.join(", ")})`}, emphasized {`(${MOTION.easing.emphasized.join(", ")})`}, exit {`(${MOTION.easing.exit.join(", ")})`}
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
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<"one" | "two">("one");
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Demo title="Button">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="danger-ghost">Danger ghost</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Small</Button>
          <Button loading>Loading</Button>
          <Button confirm={confirmed} onClick={() => { setConfirmed(true); setTimeout(() => setConfirmed(false), 1400); }}>
            {confirmed ? "" : "Click → confirm"}
          </Button>
          <Button disabledReason="Disabled with a reason — shown on hover">Disabled</Button>
          <IconButton aria-label="Close demo"><X className="size-4" /></IconButton>
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

      <Demo title="Fields">
        <Field label="Name" htmlFor="ds-name" hint="A hint under the field">
          <Input id="ds-name" placeholder="Type here…" />
        </Field>
        <Field label="Machine text (always LTR)" htmlFor="ds-key">
          <Input id="ds-key" className="data" placeholder="fl_test_…" />
        </Field>
        <Field label="Pick one" htmlFor="ds-select">
          <Select id="ds-select" defaultValue="a">
            <option value="a">Option A</option>
            <option value="b">Option B</option>
          </Select>
        </Field>
        <Textarea placeholder="Textarea" rows={2} />
        <Field label="Invalid" htmlFor="ds-inv" error="This value is not valid">
          <Input id="ds-inv" invalid defaultValue="bad value" />
        </Field>
      </Demo>

      <Demo title="Overlays">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Button size="sm" onClick={() => setDrawerOpen(true)}>Open drawer</Button>
          <Menu>
            <MenuTrigger asChild><Button size="sm">Menu</Button></MenuTrigger>
            <MenuContent side="bottom">
              <MenuLabel>Section</MenuLabel>
              <MenuItem>Item one</MenuItem>
              <MenuItem>Item two</MenuItem>
              <MenuSeparator />
              <MenuItem danger>Danger item</MenuItem>
            </MenuContent>
          </Menu>
          <Popover>
            <PopoverTrigger asChild><Button size="sm">Popover</Button></PopoverTrigger>
            <PopoverContent className="w-56"><p className="text-sm text-med">A popover panel with motion on open and close.</p></PopoverContent>
          </Popover>
          <Tooltip content="A tooltip" side="top"><Button size="sm">Hover me</Button></Tooltip>
          <Button size="sm" onClick={() => toast("A toast slides in and out", "success")}>Toast</Button>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen} title="Dialog title" closeLabel="Close">
          <p className="mt-3 text-base text-med">Focus is trapped; Escape or the scrim closes it. Motion on open and close.</p>
        </Dialog>
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Drawer title" closeLabel="Close">
          <p className="p-5 text-base text-med">Slides in from the inline-end (mirrors in RTL).</p>
        </Drawer>
      </Demo>

      <Demo title="Tabs">
        <Tabs tabs={[{ id: "one", label: "First" }, { id: "two", label: "Second" }]} value={tab} onChange={setTab} label="Demo tabs" className="flex-none">
          <TabPanel value="one" className="py-3 text-base text-med">First panel — tab switches fade in (motion-enter).</TabPanel>
          <TabPanel value="two" className="py-3 text-base text-med">Second panel.</TabPanel>
        </Tabs>
      </Demo>

      <Demo title="States">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-40" />
        </div>
        <UsageBar ratio={0.26} label="Usage example: 26%" />
        <UsageBar ratio={0.8} label="Usage example: 80%" />
        <UsageBar ratio={0.95} label="Usage example: 95%" />
        <EmptyState icon={<Play className="size-6" />} title="Nothing here yet" body="Empty states explain the next step." action={<Button size="sm">Action</Button>} />
        <ErrorState title="Couldn't load" body="Errors always ship with a recovery action." onRetry={() => {}} />
      </Demo>

      <Demo title="Brand & preferences">
        <Logo />
        <span className="bg-brand block size-8 rounded-md" aria-label="Brand gradient swatch" />
        <ThemeSwitcher />
        <LanguageSwitcher />
      </Demo>
    </div>
  );
}

/* ───────── Motion primitives ───────── */

function MotionDemo({ cls, label, note }: { cls: string; label: string; note: string }) {
  const [n, setN] = useState(0);
  return (
    <div className="flex flex-col gap-2">
      <div key={n} className={cn("flex h-16 items-center justify-center rounded-lg border border-line bg-card text-sm text-med", cls)}>
        {label}
      </div>
      <p className="text-xs text-muted">{note}</p>
      <Button size="sm" className="self-start" onClick={() => setN((x) => x + 1)}>Replay</Button>
    </div>
  );
}

function MotionDemos() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MotionDemo cls="motion-enter" label="motion-enter" note="150 ms — panels, tab switches" />
      <MotionDemo cls="motion-pop" label="motion-pop" note="150 ms — menus, popovers, dialogs" />
      <MotionDemo cls="motion-list-in" label="motion-list-in" note="200 ms — new list items" />
      <MotionDemo cls="motion-confirm" label="motion-confirm" note="200 ms — confirm-success on controls" />
      <MotionDemo cls="motion-shake" label="motion-shake" note="250 ms once — failures" />
      <MotionDemo cls="motion-running" label="motion-running" note="loops while running; a static ring with reduced motion" />
      <div className="flex flex-col gap-2">
        <div className="skeleton h-16" />
        <p className="text-xs text-muted">skeleton shimmer — 1600 ms sweep, mirrors in RTL</p>
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="primary" className="h-16">motion-press — press me</Button>
        <p className="text-xs text-muted">80 ms scale-down; never a hover lift</p>
      </div>
    </div>
  );
}

/* ───────── Page ───────── */

function Panel({ theme, dir, lang, children }: { theme: ThemeName; dir: "ltr" | "rtl"; lang: "en" | "ar"; children: ReactNode }) {
  return (
    <div data-theme={theme} dir={dir} lang={lang} className="rounded-xl border border-line bg-app p-5 text-hi">
      {children}
    </div>
  );
}

export function Guide() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10 sm:px-8">
      <header>
        <h1 className="text-2xl font-semibold">Flowline design system</h1>
        <p className="mt-1 max-w-2xl text-base text-med">
          Internal style guide (dev/test only). Tokens come from <code className="data" dir="ltr">src/design/tokens.ts</code>; components use only semantic
          tokens. Everything below honours <code className="data" dir="ltr">prefers-reduced-motion</code>.
        </p>
      </header>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Tokens — both themes</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel theme="dark" dir="ltr" lang="en">
            <SectionLabel className="mb-3">Dark (default)</SectionLabel>
            <TokenTable theme="dark" />
          </Panel>
          <Panel theme="light" dir="ltr" lang="en">
            <SectionLabel className="mb-3">Light</SectionLabel>
            <TokenTable theme="light" />
          </Panel>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Components — both themes</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel theme="dark" dir="ltr" lang="en"><ComponentDemos /></Panel>
          <Panel theme="light" dir="ltr" lang="en"><ComponentDemos /></Panel>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Directions — English LTR and Arabic RTL</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel theme="dark" dir="ltr" lang="en">
            <SectionLabel className="mb-3">English · LTR</SectionLabel>
            <DirectionDemo />
          </Panel>
          <Panel theme="dark" dir="rtl" lang="ar">
            <SectionLabel className="mb-3">العربية · RTL</SectionLabel>
            <DirectionDemo arabic />
          </Panel>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Motion primitives</h2>
        <p className="mb-4 max-w-2xl text-base text-med">
          Purpose-named classes from <code className="data" dir="ltr">globals.css</code>. All ≤ 300 ms; reduced motion turns them off
          (the running state becomes a static ring). Scroll-linked motion on the landing page is exempt (it follows the scroll).
        </p>
        <MotionDemos />
      </section>
    </div>
  );
}

function DirectionDemo({ arabic }: { arabic?: boolean }) {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary">{arabic ? "تشغيل" : "Run flow"}</Button>
        <Button>{arabic ? "حفظ" : "Save"}</Button>
        <Badge tone="success">{arabic ? "ناجح" : "Succeeded"}</Badge>
        <Badge tone="danger">{arabic ? "فشل" : "Failed"}</Badge>
        <CategoryChip category="ai">{arabic ? "ذكاء اصطناعي" : "AI"}</CategoryChip>
      </div>
      <Field label={arabic ? "الاسم" : "Name"} htmlFor={arabic ? "ds-ar-name" : "ds-en-name"}>
        <Input id={arabic ? "ds-ar-name" : "ds-en-name"} placeholder={arabic ? "اكتب هنا…" : "Type here…"} />
      </Field>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => toast(arabic ? "انزلاق الإشعار يعكس اتجاهه" : "Toasts mirror in RTL", "info")}>
          {arabic ? "إشعار" : "Toast"}
        </Button>
        <span className="text-sm text-muted">
          {arabic ? "النصوص الآلية تبقى LTR:" : "Machine text stays LTR:"} <code className="data" dir="ltr">fl_test_9f27ac</code>
        </span>
      </div>
    </div>
  );
}
