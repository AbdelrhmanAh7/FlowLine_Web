"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FlowGraph } from "@/engine/types";
import { api, ApiError } from "@/lib/api";
import { clearDraft, saveDraft } from "@/lib/drafts";
import { useOnline } from "@/lib/hooks";
import type { FlowDto } from "@/lib/types";
import type { Snapshot } from "./graph-utils";

export type SaveStatus = "saved" | "unsaved" | "saving" | "retrying" | "failed" | "offline" | "conflict" | "readonly";

export interface Conflict {
  serverRevision: number;
  serverName: string;
  serverGraph: FlowGraph;
  /** Local draft time, when the conflict came from an offline draft found on load. */
  localSavedAt?: number;
}

const AUTOSAVE_MS = 1000;
export const RETRY_DELAYS = [1000, 2000, 4000];

export const serialize = (name: string, s: Pick<Snapshot, "nodes" | "edges">) => JSON.stringify({ name, nodes: s.nodes, edges: s.edges });

interface Options {
  flow: FlowDto;
  userId: string;
  canEdit: boolean;
  name: string;
  snapshot: Snapshot;
  viewport: () => FlowGraph["viewport"];
  /** Replace editor contents (used when the user picks the server copy). */
  onReplace: (graph: FlowGraph, name: string) => void;
  /** A local draft older than the server copy was found on load. */
  initialConflict: Conflict | null;
}

/**
 * Save state machine: debounced autosave, silent retries (1s/2s/4s) then a manual
 * Retry, local drafts while offline or failing, and revision-checked saves so a
 * reconnect never silently overwrites someone else's changes.
 */
export function usePersistence({ flow, userId, canEdit, name, snapshot, viewport, onReplace, initialConflict }: Options) {
  const online = useOnline();
  const current = serialize(name, snapshot);
  const [savedSer, setSavedSer] = useState(() => serialize(flow.name, flow.graph));
  const savedRef = useRef(savedSer);
  const revisionRef = useRef(flow.revision);
  const inflight = useRef(false);
  const retryIndex = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<"idle" | "saving" | "retrying" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(initialConflict);
  const [retryTick, setRetryTick] = useState(0);
  const handledTick = useRef(0);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const latest = useRef({ name, snapshot, current });
  useEffect(() => {
    latest.current = { name, snapshot, current };
  }, [name, snapshot, current]);

  const dirty = current !== savedSer;

  const markSaved = (body: string) => {
    savedRef.current = body;
    setSavedSer(body);
  };

  const doSave = useCallback(
    async (opts: { createVersion?: boolean; force?: boolean } = {}): Promise<boolean> => {
      // Yield first so callers inside effects never trigger synchronous state updates.
      await Promise.resolve();
      if (!canEdit || inflight.current) return false;
      if (conflict && !opts.force) return false;
      const { name: n, snapshot: s, current: body } = latest.current;
      if (!opts.createVersion && !opts.force && body === savedRef.current) return true;
      if (!navigator.onLine) return false;
      inflight.current = true;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      setPhase((p) => (p === "retrying" ? p : "saving"));
      try {
        const res = await api<{ flow: FlowDto }>(`/api/flows/${flow.id}`, {
          method: "PUT",
          json: { name: n, graph: { nodes: s.nodes, edges: s.edges, viewport: viewport() }, baseRevision: revisionRef.current, createVersion: opts.createVersion, force: opts.force },
        });
        revisionRef.current = res.flow.revision;
        markSaved(body);
        retryIndex.current = 0;
        setError(null);
        setConflict(null);
        setLastSavedAt(Date.now());
        if (latest.current.current === body) clearDraft(userId, flow.id);
        setPhase("idle");
        return true;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(0, "NETWORK", String(e));
        if (err.status === 409) {
          const d = err.details as { serverRevision: number; serverName: string; serverGraph: FlowGraph };
          setConflict({ serverRevision: d.serverRevision, serverName: d.serverName, serverGraph: d.serverGraph });
          setPhase("idle");
        } else if (err.status === 0 && !navigator.onLine) {
          setPhase("idle"); // offline: the draft is kept; reconnect triggers a save
        } else if (err.status === 0 || err.status >= 500) {
          if (retryIndex.current < RETRY_DELAYS.length) {
            const delay = RETRY_DELAYS[retryIndex.current]!;
            retryIndex.current += 1;
            setPhase("retrying");
            retryTimer.current = setTimeout(() => {
              retryTimer.current = null;
              setRetryTick((t) => t + 1);
            }, delay);
          } else {
            setPhase("failed");
            setError(err.message);
          }
        } else {
          setPhase("failed");
          setError(err.message);
        }
        return false;
      } finally {
        inflight.current = false;
      }
    },
    [canEdit, conflict, flow.id, userId, viewport],
  );

  // Scheduled retries.
  useEffect(() => {
    if (retryTick === handledTick.current) return;
    handledTick.current = retryTick;
    void doSave();
  }, [retryTick, doSave]);

  // Keep a local draft whenever there are unsaved edits (survives offline + reloads).
  useEffect(() => {
    if (!canEdit || !dirty) return;
    saveDraft({ userId, flowId: flow.id, name, graph: { nodes: snapshot.nodes, edges: snapshot.edges }, baseRevision: revisionRef.current, savedAt: Date.now() });
  }, [current, dirty, canEdit, userId, flow.id, name, snapshot]);

  // Debounced autosave.
  useEffect(() => {
    if (!canEdit || !dirty || !online || conflict || phase !== "idle") return;
    const t = setTimeout(() => void doSave(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [current, dirty, online, conflict, canEdit, doSave, phase]);

  // Reconnect: push pending edits right away (the revision check prevents silent overwrites).
  const wasOnline = useRef(online);
  useEffect(() => {
    const cameBack = online && !wasOnline.current;
    wasOnline.current = online;
    if (cameBack && canEdit && !conflict) {
      retryIndex.current = 0;
      void doSave();
    }
  }, [online, canEdit, conflict, doSave]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  const resolveConflict = useCallback(
    async (choice: "mine" | "server") => {
      if (!conflict) return;
      if (choice === "server") {
        revisionRef.current = conflict.serverRevision;
        markSaved(serialize(conflict.serverName, conflict.serverGraph));
        clearDraft(userId, flow.id);
        onReplace(conflict.serverGraph, conflict.serverName);
        setConflict(null);
        return;
      }
      // Keep mine: explicit overwrite. The server keeps its copy as an "overwrite" version.
      await doSave({ force: true });
    },
    [conflict, doSave, flow.id, onReplace, userId],
  );

  const retryNow = useCallback(() => {
    retryIndex.current = 0;
    setPhase("idle");
    void doSave();
  }, [doSave]);

  let status: SaveStatus;
  if (!canEdit) status = "readonly";
  else if (conflict) status = "conflict";
  else if (phase === "saving") status = "saving";
  else if (phase === "retrying") status = "retrying";
  else if (phase === "failed") status = "failed";
  else if (dirty) status = online ? "unsaved" : "offline";
  else status = "saved";

  return { status, error, dirty, conflict, lastSavedAt, saveNow: doSave, retryNow, resolveConflict };
}
