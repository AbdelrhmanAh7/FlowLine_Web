"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu as MenuIcon, type LucideIcon } from "lucide-react";
import type { Role } from "@/db/schema";
import { signOutEverywhere } from "@/lib/auth-client";
import { initials } from "@/lib/format";
import { useHealth, useOnline } from "@/lib/hooks";
import { useLocale, useSetLocale, useT } from "@/i18n/client";
import { LOCALES, type Locale } from "@/i18n/config";
import { THEME_PREFERENCES, type ThemePreference } from "@/theme/config";
import { useSetTheme, useThemePreference } from "@/theme/client";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuLink, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger, NAV_ICONS, StatusBadge, cn } from "../ui";
import { WorkspaceContext, type WorkspaceInfo } from "./workspace-context";

interface Props {
  user: { id: string; name: string; email: string };
  workspace: WorkspaceInfo;
  role: Role;
  workspaces: { id: string; name: string; slug: string; role?: string }[];
  support?: Support;
  children: ReactNode;
}

interface Support {
  beta: boolean;
  supportEmail: string | null;
  feedbackUrl: string | null;
}

const NO_SUPPORT: Support = { beta: false, supportEmail: null, feedbackUrl: null };

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
}

export function AppShell({ user, workspace, role, workspaces, support = NO_SUPPORT, children }: Props) {
  const t = useT();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const base = `/w/${workspace.slug}`;

  // Close the mobile menu on navigation (render-time reset avoids an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: t("shell.sections.build"),
      items: [
        { href: `${base}/flows`, label: t("shell.nav.flows"), icon: NAV_ICONS.flows, match: (p) => p === `${base}/flows` },
        { href: `${base}/canvas`, label: t("shell.nav.canvas"), icon: NAV_ICONS.canvas, match: (p) => p.startsWith(`${base}/flows/`) || p === `${base}/canvas` },
        { href: `${base}/templates`, label: t("shell.nav.templates"), icon: NAV_ICONS.templates, match: (p) => p.startsWith(`${base}/templates`) },
      ],
    },
    {
      title: t("shell.sections.ai"),
      items: [
        { href: `${base}/agents`, label: t("shell.nav.agents"), icon: NAV_ICONS.agents, match: (p) => p.startsWith(`${base}/agents`) },
        { href: `${base}/knowledge`, label: t("shell.nav.knowledge"), icon: NAV_ICONS.knowledge, match: (p) => p.startsWith(`${base}/knowledge`) },
      ],
    },
    {
      title: t("shell.sections.observe"),
      items: [
        { href: `${base}/runs`, label: t("shell.nav.runs"), icon: NAV_ICONS.runs, match: (p) => p.startsWith(`${base}/runs`) },
        { href: `${base}/integrations`, label: t("shell.nav.integrations"), icon: NAV_ICONS.integrations, match: (p) => p.startsWith(`${base}/integrations`) },
      ],
    },
  ];
  const settings: NavItem = { href: `${base}/settings`, label: t("shell.nav.settings"), icon: NAV_ICONS.settings, match: (p) => p.startsWith(`${base}/settings`) };

  return (
    <WorkspaceContext.Provider value={{ user, workspace, role, canEdit: role !== "viewer", workspaces }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[200] focus:rounded-md focus:bg-accent focus:px-3 focus:py-1.5 focus:text-on-accent">
        {t("shell.skipToContent")}
      </a>
      <div className="flex h-dvh overflow-hidden bg-app">
        {/* Desktop sidebar (240px) / tablet icon rail (48px) */}
        <aside aria-label={t("shell.workspaceNav")} className="hidden shrink-0 flex-col border-e border-line bg-surface md:flex md:w-[var(--rail-w)] xl:w-[var(--sidebar-w)]">
          <SidebarContent support={support} sections={sections} settings={settings} pathname={pathname} workspace={workspace} user={user} compact />
        </aside>

        {/* Mobile menu sheet */}
        {menuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button aria-label={t("shell.closeMenu")} className="absolute inset-0 bg-scrim" onClick={() => setMenuOpen(false)} />
            <aside aria-label={t("shell.workspaceNav")} className="motion-drawer relative flex h-full w-[min(280px,85vw)] flex-col border-e border-line bg-surface">
              <SidebarContent support={support} sections={sections} settings={settings} pathname={pathname} workspace={workspace} user={user} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 md:hidden">
            <button aria-label={t("shell.openMenu")} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="-ms-1 flex size-9 items-center justify-center rounded-md text-lg text-med hover:bg-card hover:text-hi">
              <MenuIcon className="size-5" aria-hidden />
            </button>
            <span className="truncate text-base font-semibold">{workspace.name}</span>
          </div>
          <StatusBanners />
          <main id="main" className="relative min-h-0 flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}

function SidebarContent({
  sections,
  settings,
  pathname,
  workspace,
  user,
  support,
  compact,
}: {
  support: Support;
  sections: { title: string; items: NavItem[] }[];
  settings: NavItem;
  pathname: string;
  workspace: WorkspaceInfo;
  user: { name: string; email: string };
  compact?: boolean;
}) {
  const t = useT();
  // `compact` = icon rail on tablet widths; labels appear from xl (≥1280).
  const label = compact ? "hidden xl:inline" : "";
  return (
    <>
      <div className={cn("flex h-14 items-center gap-2.5 border-b border-line", compact ? "justify-center px-0 xl:justify-start xl:px-4" : "px-4")}>
        <span aria-hidden className="bg-brand size-6 shrink-0 rounded-md" />
        <span className={cn("truncate text-base font-semibold", label)} title={workspace.name}>
          {workspace.name}
        </span>
        {support.beta && (
          <StatusBadge tone="accent" upper className={cn("shrink-0", compact && "hidden xl:inline-flex")}>
            {t("shell.beta")}
          </StatusBadge>
        )}
      </div>
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-4">
        {sections.map((s) => (
          <div key={s.title}>
            <p className={cn("mb-1.5 px-2 text-xs font-medium tracking-[0.4px] text-muted uppercase", compact && "hidden xl:block")}>{s.title}</p>
            <ul className="flex flex-col gap-0.5">
              {s.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={item.match(pathname)} compact={compact} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex flex-col gap-1 border-t border-line p-2">
        <NavLink item={settings} active={settings.match(pathname)} compact={compact} />
        <UserMenu user={user} support={support} compact={compact} />
      </div>
    </>
  );
}

function NavLink({ item, active, compact }: { item: NavItem; active: boolean; compact?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={compact ? item.label : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md border px-2 text-base transition-colors duration-[var(--dur-base)]",
        compact && "justify-center xl:justify-start",
        active ? "border-accent-border bg-accent-bg text-hi" : "border-transparent text-med hover:bg-card hover:text-hi",
      )}
    >
      <Icon aria-hidden className={cn("size-4 shrink-0", active && "text-accent")} />
      <span className={compact ? "sr-only xl:not-sr-only" : ""}>{item.label}</span>
    </Link>
  );
}

function UserMenu({ user, support, compact }: { user: { name: string; email: string }; support: Support; compact?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const theme = useThemePreference();
  const setTheme = useSetTheme();
  const localeNames: Record<Locale, string> = { ar: t("language.ar"), en: t("language.en") };
  const report = support.feedbackUrl ?? (support.supportEmail ? `mailto:${support.supportEmail}?subject=${encodeURIComponent("Flowline beta: issue report")}` : null);
  const missing = t("shell.userMenu.supportNotConfigured");
  return (
    <Menu>
      <MenuTrigger
        className={cn("flex h-10 w-full items-center gap-2.5 rounded-md px-2 text-start text-base text-med outline-none hover:bg-card hover:text-hi", compact && "justify-center xl:justify-start")}
        title={compact ? user.name : undefined}
      >
        <span aria-hidden className="bg-brand flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-on-accent">
          {initials(user.name) || "?"}
        </span>
        <span className={cn("min-w-0 flex-1 truncate", compact && "hidden xl:block")}>{user.name}</span>
      </MenuTrigger>
      <MenuContent>
        <div className="px-2.5 py-2">
          <p className="truncate text-base font-medium">{user.name}</p>
          <p className="data truncate text-sm text-med">
            <span dir="ltr">{user.email}</span>
          </p>
        </div>
        <MenuItem href={report ?? undefined} disabled={!report} disabledTitle={missing}>
          {t("shell.userMenu.reportIssue")}
        </MenuItem>
        <MenuItem href={support.supportEmail ? `mailto:${support.supportEmail}` : undefined} disabled={!support.supportEmail} disabledTitle={missing}>
          {t("shell.userMenu.contactSupport")}
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>{t("shell.userMenu.account")}</MenuLabel>
        <MenuLink href="/resend-verification">{t("shell.userMenu.resendVerification")}</MenuLink>
        <MenuLink href="/account/delete" danger>
          {t("shell.userMenu.deleteAccount")}
        </MenuLink>
        <MenuSeparator />
        <MenuItem onSelect={() => void signOutEverywhere()}>{t("shell.userMenu.signOut")}</MenuItem>
        <MenuSeparator />
        <MenuLabel>{t("language.label")}</MenuLabel>
        <MenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as Locale)}>
          {LOCALES.map((l) => (
            <MenuRadioItem key={l} value={l}>
              <span lang={l} dir={l === "ar" ? "rtl" : "ltr"}>
                {localeNames[l]}
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuLabel>{t("theme.label")}</MenuLabel>
        <MenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
          {THEME_PREFERENCES.map((p) => (
            <MenuRadioItem key={p} value={p}>
              {t(`theme.${p}`)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

function StatusBanners() {
  const t = useT();
  const online = useOnline();
  const health = useHealth();
  if (!online) {
    return (
      <div role="status" className="flex shrink-0 items-center gap-2 border-b border-info-border bg-info-bg px-4 py-2 text-base text-info">
        <span aria-hidden>●</span> <strong className="font-semibold">{t("shell.banners.offlineTitle")}</strong>
        <span className="text-med">{t("shell.banners.offlineBody")}</span>
      </div>
    );
  }
  if (health.data?.worker === "offline") {
    return (
      <div role="status" className="flex shrink-0 flex-wrap items-center gap-x-2 border-b border-warning-border bg-warning-bg px-4 py-2 text-base text-warning">
        <span aria-hidden>⚠</span> <strong className="font-semibold">{t("shell.banners.workerTitle")}</strong>
        <span className="text-med">
          {t.rich("shell.banners.workerBody", {
            command: (
              <code dir="ltr" className="data text-hi">
                pnpm worker
              </code>
            ),
          })}
        </span>
      </div>
    );
  }
  if (health.isError) {
    return (
      <div role="status" className="flex shrink-0 items-center gap-2 border-b border-danger-border bg-danger-bg px-4 py-2 text-base text-danger">
        <span aria-hidden>⚠</span> <strong className="font-semibold">{t("shell.banners.dbTitle")}</strong>
        <button className="underline" onClick={() => void health.refetch()}>
          {t("common.retry")}
        </button>
      </div>
    );
  }
  return null;
}
