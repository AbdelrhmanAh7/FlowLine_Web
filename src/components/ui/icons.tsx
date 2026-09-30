"use client";

import {
  ArrowLeftRight,
  Blocks,
  BookOpen,
  Bot,
  Braces,
  Clock,
  CodeXml,
  Cog,
  Database,
  FileText,
  Filter,
  GitBranch,
  Globe,
  History,
  LayoutTemplate,
  LogOut,
  Play,
  Repeat,
  Sheet,
  Sparkles,
  Split,
  Table2,
  Webhook,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { NodeType } from "@/engine/types";
import type { CategoryHue } from "./badge";

/**
 * One icon set (lucide) across the system — replaces the unicode glyphs. The engine keeps its own
 * platform-neutral icon strings; this is the web UI's rendering of them.
 */

/** Sidebar / shell navigation. */
export const NAV_ICONS = {
  flows: Table2,
  canvas: Workflow,
  templates: LayoutTemplate,
  agents: Bot,
  knowledge: BookOpen,
  runs: History,
  integrations: Blocks,
  settings: Cog,
} as const satisfies Record<string, LucideIcon>;

/** Canvas node types → icon. */
export const NODE_ICONS = {
  "trigger.manual": Play,
  "trigger.webhook": Webhook,
  "trigger.schedule": Clock,
  "transform.json": Braces,
  "logic.condition": Split,
  output: LogOut,
  "data.filter": Filter,
  "data.map": ArrowLeftRight,
  "data.merge": GitBranch,
  "data.csv": Sheet,
  "data.file": FileText,
  "data.store": Database,
  "logic.loop": Repeat,
  "flow.subflow": Workflow,
  "http.request": Globe,
  "ai.generate": Sparkles,
  "ai.extract": Braces,
  "ai.classify": Sparkles,
  "code.js": CodeXml,
  "integration.action": Blocks,
} as const satisfies Record<NodeType, LucideIcon>;

/** Category fallback (palette groups, templates previews). */
export const CATEGORY_ICONS: Record<CategoryHue, LucideIcon> = {
  trigger: Play,
  logic: Split,
  ai: Sparkles,
  app: Blocks,
  output: LogOut,
};

export function nodeIcon(type: NodeType): LucideIcon {
  return NODE_ICONS[type];
}
