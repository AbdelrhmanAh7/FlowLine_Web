import { CATEGORY_HUE, CAT_BG, CAT_TEXT, NODE_ICONS, cn } from "@/components/ui";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import type { NodeType } from "@/engine/types";

export interface IllustrationNode {
  id: string;
  type: NodeType;
  label: string;
  sub: string;
}

/**
 * A flow drawn with the same visual language as the real canvas (category hues, node chrome) — an
 * illustration, not a screenshot. `lit` = how many leading nodes glow as "run"; edges between lit
 * nodes are drawn. Fully static: every dynamic value arrives as a prop.
 */
export function FlowIllustration({ nodes, lit, className }: { nodes: IllustrationNode[]; lit: number; className?: string }) {
  return (
    <div dir="ltr" className={cn("flex flex-col items-center gap-3 sm:flex-row sm:items-stretch sm:gap-0", className)}>
      {nodes.map((n, i) => {
        const hue = CATEGORY_HUE[NODE_DEFINITIONS[n.type].category];
        const Icon = NODE_ICONS[n.type];
        const on = i < lit;
        return (
          <div key={n.id} className="flex flex-col items-center gap-3 sm:flex-1 sm:flex-row sm:gap-0">
            <div
              data-lit={on || undefined}
              className={cn(
                "w-44 shrink-0 rounded-lg border bg-elevated shadow-[var(--shadow-popover)] px-3.5 py-3 text-start transition-[border-color,box-shadow,opacity] duration-[var(--dur-slow)]",
                on ? "border-accent shadow-[var(--shadow-glow)]" : "border-line-strong opacity-70",
              )}
            >
              <p className="flex items-center gap-2 text-base font-semibold">
                <span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", CAT_BG[hue])}>
                  <Icon className={cn("size-3.5", CAT_TEXT[hue])} />
                </span>
                <span className="min-w-0 break-words">{n.label}</span>
              </p>
              <p className="mt-0.5 ps-8 text-[10px] tracking-[0.4px] text-muted">{n.sub}</p>
            </div>
            {i < nodes.length - 1 && (
              <>
                {/* vertical connector (mobile) */}
                <div aria-hidden className={cn("h-6 w-px sm:hidden", i + 1 < lit ? "bg-accent" : "bg-line-strong")} />
                {/* horizontal connector */}
                <div aria-hidden className={cn("hidden h-px min-w-4 flex-1 self-center transition-colors duration-[var(--dur-slow)] sm:block", i + 1 < lit ? "bg-accent" : "bg-line-strong")} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
