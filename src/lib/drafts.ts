import type { FlowGraph } from "@/engine/types";

/**
 * Offline drafts live in localStorage, keyed by user AND flow so one account
 * can never read another's draft on a shared browser. They hold only the flow
 * graph and name (no credentials or tokens) and are wiped on sign-out.
 */
const PREFIX = "flowline:draft:";

export interface LocalDraft {
  userId: string;
  flowId: string;
  name: string;
  graph: FlowGraph;
  /** Server revision the local edits were based on. */
  baseRevision: number;
  savedAt: number;
}

const key = (userId: string, flowId: string) => `${PREFIX}${userId}:${flowId}`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function saveDraft(d: LocalDraft) {
  try {
    storage()?.setItem(key(d.userId, d.flowId), JSON.stringify(d));
  } catch {
    /* storage full or blocked — draft is best-effort */
  }
}

export function loadDraft(userId: string, flowId: string): LocalDraft | null {
  try {
    const raw = storage()?.getItem(key(userId, flowId));
    if (!raw) return null;
    const d = JSON.parse(raw) as LocalDraft;
    return d.userId === userId && d.flowId === flowId ? d : null;
  } catch {
    return null;
  }
}

export function clearDraft(userId: string, flowId: string) {
  try {
    storage()?.removeItem(key(userId, flowId));
  } catch {
    /* ignore */
  }
}

export function clearAllDrafts() {
  const s = storage();
  if (!s) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => s.removeItem(k));
  } catch {
    /* ignore */
  }
}
