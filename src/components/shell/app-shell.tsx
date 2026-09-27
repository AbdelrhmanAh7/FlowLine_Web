"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Role } from "@/db/schema";
import { signOutEverywhere } from "@/lib/auth-client";
import { initials } from "@/lib/format";
import { useHealth, useOnline } from "@/lib/hooks";
import { cx } from "../ui";
import { WorkspaceContext, type WorkspaceInfo } from "./workspace-context";

interface Props {
  user: { id: string; name: string; email: string };
  workspace: WorkspaceInfo;
  role: Role;
  workspaces: { id: string; name: string; slug: string }[];
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  match: (p: string) => boolean;
}

export function AppShell({ user, workspace, role, workspaces, children }: Props) {
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
      title: "Build",
      items: [
        { href: `${base}/flows`, label: "Flows", icon: "▦", match: (p) => p === `${base}/flows` },
        { href: `${base}/canvas`, label: "Canvas", icon: "⌘", match: (p) => p.startsWith(`${base}/flows/`) || p === `${base}/canvas` },
        { href: `${base}/templates`, label: "Templates", icon: "▤", match: (p) => p.startsWith(`${base}/templates`) },
      ],
    },
    {
      title: "AI",
      items: [
        { href: `${base}/agents`, label: "Agents", icon: "✦", match: (p) => p.startsWith(`${base}/agents`) },
        { href: `${base}/knowledge`, label: "Knowledge", icon: "❏", match: (p) => p.startsWith(`${base}/knowledge`) },
      ],
    },
    {
      title: "Observe",
      items: [
        { href: `${base}/runs`, label: "Run history", icon: "◷", match: (p) => p.startsWith(`${base}/runs`) },
        { href: `${base}/integrations`, label: "Integrations", icon: "⬡", match: (p) => p.startsWith(`${base}/integrations`) },
      ],
    },
  ];
  const settings: NavItem = { href: `${base}/settings`, label: "Settings", icon: "⚙", match: (p) => p.startsWith(`${base}/settings`) };

  return (
    <WorkspaceContext.Provider value={{ user, workspace, role, canEdit: role !== "viewer", workspaces }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-md focus:bg-accent focus:px-3 focus:py-1.5 focus:text-on-accent">
        Skip to content
      </a>
      <div className="flex h-dvh overflow-hidden bg-app">
        {/* Desktop sidebar (240px) / tablet icon rail (48px) */}
        <aside aria-label="Workspace navigation" className="hidden shrink-0 flex-col border-r border-line bg-surface md:flex md:w-[var(--rail-w)] xl:w-[var(--sidebar-w)]">
          <SidebarContent sections={sections} settings={settings} pathname={pathname} workspace={workspace} user={user} compact />
        </aside>

        {/* Mobile menu sheet */}
        {menuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
            <aside aria-label="Workspace navigation" className="relative flex h-full w-[min(280px,85vw)] animate-drawer-in flex-col border-r border-line bg-surface">
              <SidebarContent sections={sections} settings={settings} pathname={pathname} workspace={workspace} user={user} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 md:hidden">
            <button aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="-ml-1 flex size-9 items-center justify-center rounded-md text-lg text-med hover:bg-card hover:text-hi">
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
  compact,
}: {
  sections: { title: string; items: NavItem[] }[];
  settings: NavItem;
  pathname: string;
  workspace: WorkspaceInfo;
  user: { name: string; email: string };
  compact?: boolean;
}) {
  // `compact` = icon rail on tablet widths; labels appear from xl (≥1280).
  const label = compact ? "hidden xl:inline" : "";
  return (
    <>
      <div className={cx("flex h-14 items-center gap-2.5 border-b border-line", compact ? "justify-center px-0 xl:justify-start xl:px-4" : "px-4")}>
        <span aria-hidden className="size-6 shrink-0 rounded-md bg-[linear-gradient(135deg,#7c6cff_0%,#38bdf8_100%)]" />
        <span className={cx("truncate text-base font-semibold", label)} title={workspace.name}>
          {workspace.name}
        </span>
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
        <UserMenu user={user} compact={compact} />
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

function UserMenu({ user, compact }: { user: { name: string; email: string }; compact?: boolean }) {
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
        className={cx("flex h-10 w-full items-center gap-2.5 rounded-md px-2 text-left text-base text-med hover:bg-card hover:text-hi", compact && "justify-center xl:justify-start")}
        title={compact ? user.name : undefined}
      >
        <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#7c6cff,#38bdf8)] text-[10px] font-semibold text-on-accent">
          {initials(user.name) || "?"}
        </span>
        <span className={cx("min-w-0 flex-1 truncate", compact && "hidden xl:block")}>{user.name}</span>
      </button>
      {open && (
        <div role="menu" className="absolute bottom-full left-0 z-50 mb-1 w-56 animate-fade-in rounded-lg border border-line bg-elevated p-1 shadow-[var(--shadow-popover)]">
          <div className="px-2.5 py-2">
            <p className="truncate text-base font-medium">{user.name}</p>
            <p className="data truncate text-sm text-med">{user.email}</p>
          </div>
          <button role="menuitem" onClick={() => void signOutEverywhere()} className="flex h-8 w-full items-center rounded-md px-2.5 text-left text-base text-hi hover:bg-card">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBanners() {
  const online = useOnline();
  const health = useHealth();
  if (!online) {
    return (
      <div role="status" className="flex shrink-0 items-center gap-2 border-b border-info/30 bg-info/10 px-4 py-2 text-base text-info">
        <span aria-hidden>●</span> <strong className="font-semibold">Offline mode</strong>
        <span className="text-med">— edits are kept on this device; running is disabled until you reconnect.</span>
      </div>
    );
  }
  if (health.data?.worker === "offline") {
    return (
      <div role="status" className="flex shrink-0 flex-wrap items-center gap-x-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-base text-warning">
        <span aria-hidden>⚠</span> <strong className="font-semibold">Execution worker offline</strong>
        <span className="text-med">— new runs will wait in the queue. Editing still works. Start it with <code className="data text-hi">pnpm worker</code>.</span>
      </div>
    );
  }
  if (health.isError) {
    return (
      <div role="status" className="flex shrink-0 items-center gap-2 border-b border-danger/30 bg-danger/10 px-4 py-2 text-base text-danger">
        <span aria-hidden>⚠</span> <strong className="font-semibold">Flowline can&apos;t reach its database.</strong>
        <button className="underline" onClick={() => void health.refetch()}>
          Retry
        </button>
      </div>
    );
  }
  return null;
}
