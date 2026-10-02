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
export function FlowIllustration({ nodes, lit, className, onSelect }: { nodes: IllustrationNode[]; lit: number; className?: string; onSelect?: (index: number) => void }) {
  const Card = onSelect ? "button" : "div";
  return (
    <div data-testid="landing-flow" className={cn("flex w-full flex-col items-stretch gap-0 sm:flex-row", className)}>
      {nodes.map((n, i) => {
        const hue = CATEGORY_HUE[NODE_DEFINITIONS[n.type].category];
        const Icon = NODE_ICONS[n.type];
        const on = i < lit;
        return (
          <div key={n.id} className="flex min-w-0 flex-col items-center sm:contents">
            <Card
              {...(onSelect ? { type: "button" as const, onClick: () => onSelect(i), "aria-pressed": i === Math.max(0, lit - 1) } : {})}
              data-testid="landing-flow-node"
              data-active={i === Math.max(0, lit - 1) || undefined}
              data-lit={on || undefined}
              className={cn(
                "flex h-36 w-full min-w-0 flex-col justify-center rounded-lg border bg-elevated px-3.5 py-3 text-start transition-[border-color,box-shadow,background-color] duration-[var(--dur-base)] motion-reduce:transition-none sm:flex-1 shadow-[var(--shadow-popover)]",
                i === Math.max(0, lit - 1) ? "border-accent bg-accent-bg shadow-[var(--shadow-glow)]" : on ? "border-accent-border" : "border-line-strong",
              )}
            >
              <p className="flex min-h-12 items-start gap-2 text-base font-semibold">
                <span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", CAT_BG[hue])}>
                  <Icon className={cn("size-3.5", CAT_TEXT[hue])} />
                </span>
                <span className="min-w-0 break-words">{n.label}</span>
              </p>
              <p className="mt-1 min-h-9 ps-8 text-xs text-med">{n.sub}</p>
            </Card>
            {i < nodes.length - 1 && (
              <>
                {/* vertical connector (mobile) */}
                <div aria-hidden className={cn("h-6 w-px shrink-0 sm:hidden", i + 1 < lit ? "bg-accent" : "bg-line-strong")} />
                {/* horizontal connector */}
                <div aria-hidden className={cn("hidden h-px w-6 shrink-0 self-center transition-colors duration-[var(--dur-base)] motion-reduce:transition-none sm:block", i + 1 < lit ? "bg-accent" : "bg-line-strong")} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
