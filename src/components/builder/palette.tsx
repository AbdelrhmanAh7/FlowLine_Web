"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import type { NodeType } from "@/engine/types";
import { cx } from "../ui";

export const DRAG_MIME = "application/x-flowline-node";

interface Props {
  hasTrigger: boolean;
  onAdd: (type: NodeType) => void;
  onClose: () => void;
  allowDrag: boolean;
}

/** Node search/insert popover. `/` focuses the search box. */
export const NodePalette = forwardRef<HTMLInputElement, Props>(function NodePalette({ hasTrigger, onAdd, onClose, allowDrag }, ref) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return Object.values(NODE_DEFINITIONS).filter((d) => !s || d.title.toLowerCase().includes(s) || d.description.toLowerCase().includes(s) || d.category.includes(s));
  }, [q]);
  const disabledReason = (t: NodeType) => (t === "trigger.manual" && hasTrigger ? "This flow already has a trigger" : null);

  // Keep keyboard highlight inside the filtered list (render-time adjustment).
  const clamped = Math.min(active, Math.max(0, items.length - 1));
  if (clamped !== active) setActive(clamped);

  useEffect(() => {
    if (ref && typeof ref !== "function") ref.current?.focus();
  }, [ref]);

  return (
    <div role="dialog" aria-label="Add node" className="absolute top-12 left-3 z-30 w-72 animate-fade-in rounded-lg border border-line bg-elevated p-2 shadow-[var(--shadow-popover)]">
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search nodes…"
        aria-label="Search nodes"
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
      <ul id="palette-list" role="listbox" className="mt-2 flex flex-col gap-0.5">
        {items.length === 0 && <li className="px-2 py-3 text-sm text-muted">No nodes match “{q}”.</li>}
        {items.map((d, i) => {
          const reason = disabledReason(d.type);
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
              title={reason ?? (allowDrag ? "Click to add, or drag onto the canvas" : "Tap to place in the middle of the view")}
              className={cx(
                "flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2",
                i === active && !reason && "bg-card",
                reason && "cursor-not-allowed opacity-50",
              )}
            >
              <span aria-hidden className="mt-0.5 w-4 text-center text-accent">{d.icon}</span>
              <span className="min-w-0">
                <span className="block text-base font-medium">{d.title}</span>
                <span className="block text-sm text-muted">{reason ?? d.description}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
