"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import { TRIGGER_TYPES, type NodeType } from "@/engine/types";
import { useT } from "@/i18n/client";
import { nodeCategoryLabel, nodeText } from "@/i18n/engine-text";
import { useAiOverview } from "@/lib/ai";
import { useCatalog } from "@/lib/catalog";
import { useWorkspace } from "../shell/workspace-context";
import { CAT_BG, CAT_TEXT, CATEGORY_HUE, NODE_ICONS, cn } from "../ui";

export const DRAG_MIME = "application/x-flowline-node";

interface Props {
  hasTrigger: boolean;
  onAdd: (type: NodeType) => void;
  onClose: () => void;
  allowDrag: boolean;
}

/** Node search/insert popover. `/` focuses the search box. */
export const NodePalette = forwardRef<HTMLInputElement, Props>(function NodePalette({ hasTrigger, onAdd, onClose, allowDrag }, ref) {
  const t = useT();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  // Each entry in the UI language; search matches the translated text and the engine's English names alike.
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return Object.values(NODE_DEFINITIONS)
      .map((d) => ({ type: d.type, icon: d.icon, title: nodeText(t, d.type, "title"), description: nodeText(t, d.type, "description"), category: nodeCategoryLabel(t, d.category), def: d }))
      .filter(
        (d) =>
          !s ||
          [d.title, d.description, d.category, d.def.title, d.def.description, d.def.category].some((text) => text.toLowerCase().includes(s)),
      );
  }, [q, t]);
  const catalog = useCatalog();
  const runtime = catalog.data?.runtime;
  const { workspace } = useWorkspace();
  const ai = useAiOverview(workspace.id);
  const disabledReason = (type: NodeType) => {
    if (TRIGGER_TYPES.includes(type) && hasTrigger) return t("builder.hasTrigger");
    if (type === "code.js" && runtime && !runtime.codeSandbox.available) return t("palette.unavailable", { reason: runtime.codeSandbox.reason ?? "" });
    if (type.startsWith("ai.") && ai.data && !ai.data.status.canUseAny) return t("palette.unavailable", { reason: t("aiHub.status.noUsableConnection") });
    return null;
  };

  // Keep keyboard highlight inside the filtered list (render-time adjustment).
  const clamped = Math.min(active, Math.max(0, items.length - 1));
  if (clamped !== active) setActive(clamped);

  useEffect(() => {
    if (ref && typeof ref !== "function") ref.current?.focus();
  }, [ref]);

  return (
    <div role="dialog" aria-label={t("palette.dialog")} className="motion-pop absolute top-12 start-3 z-30 w-72 rounded-lg border border-line bg-elevated p-2 shadow-[var(--shadow-popover)]">
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("palette.searchPlaceholder")}
        aria-label={t("palette.searchLabel")}
        aria-controls="palette-list"
        aria-activedescendant={items[active] ? `palette-${items[active]!.type}` : undefined}
        className="h-8 w-full rounded-md border border-line-strong bg-app px-2.5 text-base placeholder:text-muted focus:border-accent focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const it = items[active];
            if (it && !disabledReason(it.type)) onAdd(it.type);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <ul id="palette-list" role="listbox" className="mt-2 flex max-h-[min(60vh,480px)] flex-col gap-0.5 overflow-y-auto">
        {items.length === 0 && <li className="px-2 py-3 text-sm text-muted">{t("palette.noMatch", { q })}</li>}
        {items.map((d, i) => {
          const reason = disabledReason(d.type);
          const hue = CATEGORY_HUE[d.def.category];
          const Icon = NODE_ICONS[d.type];
          return (
            <li
              key={d.type}
              id={`palette-${d.type}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={Boolean(reason) || undefined}
              draggable={allowDrag && !reason}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_MIME, d.type);
                e.dataTransfer.effectAllowed = "move";
              }}
              onMouseEnter={() => setActive(i)}
              onClick={() => !reason && onAdd(d.type)}
              title={reason ?? (allowDrag ? t("palette.dragHint") : t("palette.tapHint"))}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2",
                i === active && !reason && "bg-card",
                reason && "cursor-not-allowed opacity-50",
              )}
            >
              <span aria-hidden className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md", CAT_BG[hue])}>
                <Icon className={cn("size-3.5", CAT_TEXT[hue])} />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-medium">
                  {d.title} <span className="text-xs font-normal tracking-[0.4px] text-muted uppercase">{d.category}</span>
                </span>
                <span className="block text-sm text-muted">{reason ?? d.description}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
