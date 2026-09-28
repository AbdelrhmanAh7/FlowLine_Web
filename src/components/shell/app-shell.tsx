"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Role } from "@/db/schema";
import { signOutEverywhere } from "@/lib/auth-client";
import { initials } from "@/lib/format";
import { useHealth, useOnline } from "@/lib/hooks";
import { useT } from "@/i18n/client";
import { LanguageSwitcher } from "../language-switcher";
import { StatusBadge, cx } from "../ui";
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
  icon: string;
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
        { href: `${base}/flows`, label: t("shell.nav.flows"), icon: "▦", match: (p) => p === `${base}/flows` },
        { href: `${base}/canvas`, label: t("shell.nav.canvas"), icon: "⌘", match: (p) => p.startsWith(`${base}/flows/`) || p === `${base}/canvas` },
        { href: `${base}/templates`, label: t("shell.nav.templates"), icon: "▤", match: (p) => p.startsWith(`${base}/templates`) },
      ],
    },
    {
      title: t("shell.sections.ai"),
      items: [
        { href: `${base}/agents`, label: t("shell.nav.agents"), icon: "✦", match: (p) => p.startsWith(`${base}/agents`) },
        { href: `${base}/knowledge`, label: t("shell.nav.knowledge"), icon: "❏", match: (p) => p.startsWith(`${base}/knowledge`) },
      ],
    },
    {
      title: t("shell.sections.observe"),
      items: [
        { href: `${base}/runs`, label: t("shell.nav.runs"), icon: "◷", match: (p) => p.startsWith(`${base}/runs`) },
        { href: `${base}/integrations`, label: t("shell.nav.integrations"), icon: "⬡", match: (p) => p.startsWith(`${base}/integrations`) },
      ],
    },
  ];
  const settings: NavItem = { href: `${base}/settings`, label: t("shell.nav.settings"), icon: "⚙", match: (p) => p.startsWith(`${base}/settings`) };

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
            <button aria-label={t("shell.closeMenu")} className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
            <aside aria-label={t("shell.workspaceNav")} className="relative flex h-full w-[min(280px,85vw)] animate-drawer-in flex-col border-e border-line bg-surface">
              <SidebarContent support={support} sections={sections} settings={settings} pathname={pathname} workspace={workspace} user={user} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 md:hidden">
            <button aria-label={t("shell.openMenu")} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="-ms-1 flex size-9 items-center justify-center rounded-md text-lg text-med hover:bg-card hover:text-hi">
              ☰
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
      <div className={cx("flex h-14 items-center gap-2.5 border-b border-line", compact ? "justify-center px-0 xl:justify-start xl:px-4" : "px-4")}>
        <span aria-hidden className="size-6 shrink-0 rounded-md bg-[linear-gradient(135deg,#7c6cff_0%,#38bdf8_100%)]" />
        <span className={cx("truncate text-base font-semibold", label)} title={workspace.name}>
          {workspace.name}
        </span>
        {support.beta && (
          <StatusBadge tone="accent" upper className={cx("shrink-0", compact && "hidden xl:inline-flex")}>
            {t("shell.beta")}
          </StatusBadge>
        )}
      </div>
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-4">
        {sections.map((s) => (
          <div key={s.title}>
            <p className={cx("mb-1.5 px-2 text-xs font-medium tracking-[0.4px] text-muted uppercase", compact && "hidden xl:block")}>{s.title}</p>
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
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={compact ? item.label : undefined}
      className={cx(
        "flex h-8 items-center gap-2.5 rounded-md border px-2 text-base transition-colors duration-[var(--dur-hover)]",
        compact && "justify-center xl:justify-start",
        active ? "border-accent/40 bg-accent/10 text-hi" : "border-transparent text-med hover:bg-card hover:text-hi",
      )}
    >
      <span aria-hidden className="w-4 text-center text-sm">{item.icon}</span>
      <span className={compact ? "sr-only xl:not-sr-only" : ""}>{item.label}</span>
    </Link>
  );
}

function UserMenu({ user, support, compact }: { user: { name: string; email: string }; support: Support; compact?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx("flex h-10 w-full items-center gap-2.5 rounded-md px-2 text-start text-base text-med hover:bg-card hover:text-hi", compact && "justify-center xl:justify-start")}
        title={compact ? user.name : undefined}
      >
        <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#7c6cff,#38bdf8)] text-[10px] font-semibold text-on-accent">
          {initials(user.name) || "?"}
        </span>
        <span className={cx("min-w-0 flex-1 truncate", compact && "hidden xl:block")}>{user.name}</span>
      </button>
      {open && (
        <div role="menu" className="absolute bottom-full start-0 z-50 mb-1 w-56 animate-fade-in rounded-lg border border-line bg-elevated p-1 shadow-[var(--shadow-popover)]">
          <div className="px-2.5 py-2">
            <p className="truncate text-base font-medium">{user.name}</p>
            <p className="data truncate text-sm text-med">
              <span dir="ltr">{user.email}</span>
            </p>
          </div>
          {(() => {
            const report = support.feedbackUrl ?? (support.supportEmail ? `mailto:${support.supportEmail}?subject=${encodeURIComponent("Flowline beta: issue report")}` : null);
            const missing = t("shell.userMenu.supportNotConfigured");
            return (
              <>
                {report ? (
                  <a role="menuitem" href={report} target={support.feedbackUrl ? "_blank" : undefined} rel="noreferrer" className="flex h-8 w-full items-center rounded-md px-2.5 text-start text-base text-hi hover:bg-card">
                    {t("shell.userMenu.reportIssue")}
                  </a>
                ) : (
                  <span role="menuitem" aria-disabled="true" title={missing} className="flex h-8 w-full cursor-not-allowed items-center rounded-md px-2.5 text-start text-base text-muted">
                    {t("shell.userMenu.reportIssue")}
                  </span>
                )}
                {support.supportEmail ? (
                  <a role="menuitem" href={`mailto:${support.supportEmail}`} className="flex h-8 w-full items-center rounded-md px-2.5 text-start text-base text-hi hover:bg-card">
                    {t("shell.userMenu.contactSupport")}
                  </a>
                ) : (
                  <span role="menuitem" aria-disabled="true" title={missing} className="flex h-8 w-full cursor-not-allowed items-center rounded-md px-2.5 text-start text-base text-muted">
                    {t("shell.userMenu.contactSupport")}
                  </span>
                )}
              </>
            );
          })()}
          <Link role="menuitem" href="/account/delete" className="flex h-8 w-full items-center rounded-md px-2.5 text-start text-base text-hi hover:bg-card">
            {t("shell.userMenu.deleteAccount")}
          </Link>
          <div role="separator" className="my-1 h-px bg-line" />
          <button role="menuitem" onClick={() => void signOutEverywhere()} className="flex h-8 w-full items-center rounded-md px-2.5 text-start text-base text-hi hover:bg-card">
            {t("shell.userMenu.signOut")}
          </button>
          <div role="separator" className="my-1 h-px bg-line" />
          <p className="px-2.5 pt-1 text-xs text-muted">{t("language.label")}</p>
          <LanguageSwitcher variant="menu" onChange={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function StatusBanners() {
  const t = useT();
  const online = useOnline();
  const health = useHealth();
  if (!online) {
    return (
      <div role="status" className="flex shrink-0 items-center gap-2 border-b border-info/30 bg-info/10 px-4 py-2 text-base text-info">
        <span aria-hidden>●</span> <strong className="font-semibold">{t("shell.banners.offlineTitle")}</strong>
        <span className="text-med">{t("shell.banners.offlineBody")}</span>
      </div>
    );
  }
  if (health.data?.worker === "offline") {
    return (
      <div role="status" className="flex shrink-0 flex-wrap items-center gap-x-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-base text-warning">
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
      <div role="status" className="flex shrink-0 items-center gap-2 border-b border-danger/30 bg-danger/10 px-4 py-2 text-base text-danger">
        <span aria-hidden>⚠</span> <strong className="font-semibold">{t("shell.banners.dbTitle")}</strong>
        <button className="underline" onClick={() => void health.refetch()}>
          {t("common.retry")}
        </button>
      </div>
    );
  }
  return null;
}
