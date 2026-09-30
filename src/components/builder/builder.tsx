"use client";

import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Connection,
  type EdgeChange,
  type IsValidConnection,
  type NodeChange,
} from "@xyflow/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Redo2, Sparkles, TriangleAlert, Undo2, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createNode, newNodeId } from "@/engine/nodes";
import { TRIGGER_TYPES, type FlowGraph, type NodeType } from "@/engine/types";
import { checkConnection, validateGraph } from "@/engine/validate";
import { api, ApiError } from "@/lib/api";
import { loadDraft } from "@/lib/drafts";
import { isTypingTarget, modKey, useOnline, useViewport, useWindowWidth } from "@/lib/hooks";
import { isActive, type FlowResponse, type RunDetailDto, type RunListItem } from "@/lib/types";

/** Toast tone per state a run leaves "queued/running" for — a paused or cancelled run is not a failure. */
const RUN_TOAST: Record<string, "success" | "danger" | "warning" | "info"> = {
  succeeded: "success",
  failed: "danger",
  cancelled: "info",
  waiting_approval: "warning",
};
import { useDir, useT } from "@/i18n/client";
import { useCanvasColors } from "@/theme/client";
import { apiErrorMessage } from "@/i18n/errors";
import { connectionReason, issueMessage, nodeTitle } from "@/i18n/engine-text";
import type { MessageKey } from "@/i18n/types";
import { useWorkspace } from "../shell/workspace-context";
import { useToast } from "../toast";
import { Button, ConfirmCheck, ErrorState, Kbd, Popover, PopoverContent, PopoverTrigger, Skeleton, useConfirm, useKeepMounted, cx } from "../ui";
import { CanvasStatusContext, nodeTypes } from "./flow-node";
import { edgeId, toDomain, toRF, type RFEdge, type RFNode, type Snapshot } from "./graph-utils";
import { NodeDrawer } from "./node-drawer";
import { DRAG_MIME, NodePalette } from "./palette";
import { useSearchParams } from "next/navigation";
import { CopilotPanel } from "./copilot-panel";
import { HistoryPanel } from "./history-panel";
import { PausedBanner, PublishControl } from "./publish-panel";
import { RunDock } from "./run-dock";
import { serialize, usePersistence, type SaveStatus } from "./use-persistence";

const GRID = 12;
const NODE_W = 200;
const NODE_H = 84;
const snap = (v: number) => Math.round(v / GRID) * GRID;

export function Builder({ flowId }: { flowId: string }) {
  const { workspace } = useWorkspace();
  const t = useT();
  const q = useQuery({ queryKey: ["flow", flowId], queryFn: () => api<FlowResponse>(`/api/flows/${flowId}`), staleTime: Infinity });

  if (q.isPending) return <BuilderSkeleton slug={workspace.slug} />;
  if (q.isError) {
    const err = q.error as ApiError;
    return (
      <div className="flex h-full flex-col">
        <BuilderHeaderShell slug={workspace.slug} title={err.status === 404 ? t("builder.notFoundCrumb") : t("builder.flowCrumb")} />
        <div className="mx-auto mt-16 w-full max-w-md px-4">
          {err.status === 404 ? (
            <ErrorState title={t("builder.notFoundTitle")} body={t("builder.notFoundBody")} />
          ) : (
            <ErrorState title={t("builder.loadErrorTitle")} body={t("builder.loadErrorBody", { message: apiErrorMessage(t, err, err.message) })} onRetry={() => q.refetch()} retrying={q.isFetching} />
          )}
          <Link href={`/w/${workspace.slug}/flows`} className="mt-4 inline-block text-base text-accent-text hover:underline">
            <span aria-hidden className="flip-rtl">←</span> {t("builder.backToFlows")}
          </Link>
        </div>
      </div>
    );
  }
  return (
    <ReactFlowProvider>
      <Editor key={q.data.flow.id} data={q.data} />
    </ReactFlowProvider>
  );
}

function Editor({ data }: { data: FlowResponse }) {
  const { user, workspace } = useWorkspace();
  const t = useT();
  // The graph keeps LTR coordinates in every language; only the chrome around it mirrors.
  const rtl = useDir() === "rtl";
  const flow = data.flow;
  const toast = useToast();
  const qc = useQueryClient();
  const rf = useReactFlow<RFNode, RFEdge>();
  const online = useOnline();
  const viewportKind = useViewport();
  const width = useWindowWidth();
  const isMobile = viewportKind === "mobile";
  const canEditRole = data.role !== "viewer";
  const readOnly = !canEditRole || isMobile;
  const readOnlyReason = !canEditRole ? t("builder.readOnlyViewer") : isMobile ? t("builder.readOnlyMobile") : undefined;

  // Boot state: the server copy, or this user's offline draft for this flow (client-only render, so
  // reading localStorage in the initializer is safe).
  const [boot] = useState(() => {
    const draft = canEditRole ? loadDraft(user.id, flow.id) : null;
    const serverSer = serialize(flow.name, { nodes: flow.graph.nodes, edges: flow.graph.edges });
    if (!draft || serialize(draft.name, { nodes: draft.graph.nodes, edges: draft.graph.edges }) === serverSer) {
      return { graph: flow.graph, name: flow.name, restored: false, conflict: null };
    }
    const conflict =
      draft.baseRevision === flow.revision ? null : { serverRevision: flow.revision, serverName: flow.name, serverGraph: flow.graph, localSavedAt: draft.savedAt };
    return { graph: draft.graph, name: draft.name, restored: !conflict, conflict };
  });
  const initial = useMemo(() => toRF(boot.graph), [boot.graph]);
  const [nodes, setNodes] = useState<RFNode[]>(initial.nodes);
  const [edges, setEdges] = useState<RFEdge[]>(initial.edges);
  const [name, setName] = useState(boot.name);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  /* Canvas enter/exit motion: nodes that just appeared or are mid-delete, and the edge just connected. */
  const [entering, setEntering] = useState<Set<string>>(new Set());
  const [exiting, setExiting] = useState<Set<string>>(new Set());
  const [drawnEdge, setDrawnEdge] = useState<string | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "?copilot=1" (e.g. "Create with Copilot") opens the panel; search params are the same on server and client.
  const searchParams = useSearchParams();
  const [copilotOpen, setCopilotOpen] = useState(() => searchParams.has("copilot"));
  const copilotVisible = copilotOpen && !readOnly;
  const copilotMounted = useKeepMounted(copilotVisible);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const paletteInput = useRef<HTMLInputElement>(null);
  // The toolbar launchers: where focus returns when the catalogue / History / Copilot close (DV2-M01, DV2-M02).
  const addNodeButton = useRef<HTMLButtonElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const copilotButton = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const invalidReason = useRef<string | null>(null);

  const snapshot = useMemo(() => toDomain(nodes, edges), [nodes, edges]);
  const issues = useMemo(() => validateGraph({ nodes: snapshot.nodes, edges: snapshot.edges }), [snapshot]);
  const labelOf = useMemo(() => new Map(snapshot.nodes.map((n) => [n.id, n.data.label])), [snapshot]);
  const issuesByNode = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const i of issues) if (i.nodeId) m.set(i.nodeId, [...(m.get(i.nodeId) ?? []), issueMessage(t, i, labelOf.get(i.nodeId))]);
    return m;
  }, [issues, labelOf, t]);

  /* ───── history (undo/redo — documented extension) ───── */
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const lastPush = useRef<{ key: string; at: number } | null>(null);
  const [history, setHistory] = useState({ past: 0, future: 0 });
  const bumpHistory = useCallback(() => setHistory({ past: past.current.length, future: future.current.length }), []);
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const pushHistory = useCallback((coalesceKey?: string) => {
    const now = Date.now();
    if (coalesceKey && lastPush.current?.key === coalesceKey && now - lastPush.current.at < 1200) {
      lastPush.current.at = now;
      return;
    }
    lastPush.current = coalesceKey ? { key: coalesceKey, at: now } : null;
    past.current.push(structuredClone(snapshotRef.current));
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    bumpHistory();
  }, [bumpHistory]);

  const restore = useCallback((s: Snapshot) => {
    // An in-flight delete animation must not remove nodes the user just restored.
    if (deleteTimer.current) {
      clearTimeout(deleteTimer.current);
      deleteTimer.current = null;
      setExiting(new Set());
    }
    const r = toRF({ nodes: s.nodes, edges: s.edges });
    setNodes(r.nodes);
    setEdges(r.edges);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(structuredClone(snapshotRef.current));
    lastPush.current = null;
    restore(prev);
    bumpHistory();
  }, [restore, bumpHistory]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(structuredClone(snapshotRef.current));
    lastPush.current = null;
    restore(next);
    bumpHistory();
  }, [restore, bumpHistory]);

  /* ───── persistence ───── */
  const replace = useCallback(
    (graph: FlowGraph, newName: string) => {
      if (deleteTimer.current) {
        clearTimeout(deleteTimer.current);
        deleteTimer.current = null;
        setExiting(new Set());
      }
      const r = toRF(graph);
      setNodes(r.nodes);
      setEdges(r.edges);
      setName(newName);
      past.current = [];
      future.current = [];
      bumpHistory();
    },
    [bumpHistory],
  );
  const persistence = usePersistence({ flow, userId: user.id, canEdit: canEditRole, name, snapshot, viewport: () => rf.getViewport(), onReplace: replace, initialConflict: boot.conflict });

  // Tell the user when we restored their own unsaved edits from this device.
  useEffect(() => {
    if (boot.restored) toast(t("builder.restoredDraft"), "info");
  }, [boot.restored, toast, t]);

  /* ───── runs ───── */
  const runsQ = useQuery({
    queryKey: ["flow-runs", flow.id],
    queryFn: () => api<{ runs: RunListItem[] }>(`/api/flows/${flow.id}/runs`),
    select: (d) => d.runs,
    refetchInterval: (query) => (query.state.data?.runs.some((r) => isActive(r.status)) ? 1500 : false),
  });
  const activeRunId = selectedRunId ?? runsQ.data?.[0]?.id ?? null;
  const runQ = useQuery({
    queryKey: ["run", activeRunId],
    enabled: Boolean(activeRunId),
    queryFn: () => api<{ run: RunDetailDto }>(`/api/runs/${activeRunId}`),
    select: (d) => d.run,
    refetchInterval: (query) => (query.state.data && isActive(query.state.data.run.status) ? 700 : query.state.data?.run.status === "waiting_approval" ? 4000 : false),
  });
  const cancelMut = useMutation({
    mutationFn: (runId: string) => api<{ status: string }>(`/api/runs/${runId}/cancel`, { method: "POST" }),
    onSuccess: (r) => {
      toast(r.status === "cancelled" ? t("builder.runCancelled") : t("builder.runCancelling"), "info");
      void qc.invalidateQueries({ queryKey: ["run", activeRunId] });
    },
    onError: (e) => toast(apiErrorMessage(t, e), "danger"),
  });
  const run = runQ.data;
  const runActive = run ? isActive(run.status) : false;
  const prevStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevStatus.current && isActive(prevStatus.current) && run && !isActive(run.status)) {
      void qc.invalidateQueries({ queryKey: ["flow-runs", flow.id] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
      const tone = RUN_TOAST[run.status];
      toast(tone ? t(`builder.runToast.${run.status}` as MessageKey, { number: run.number }) : t("builder.runToast.finished", { number: run.number, status: run.status }), tone ?? "info");
    }
    prevStatus.current = run?.status;
  }, [run, qc, flow.id, toast, t]);

  const steps = useMemo(() => new Map((run?.steps ?? []).map((s) => [s.nodeId, s])), [run]);

  const runReason = !online
    ? t("builder.runReason.offline")
    : !canEditRole
      ? t("builder.runReason.viewer")
      : persistence.status === "conflict"
        ? t("builder.runReason.conflict")
        : issues.length > 0
          ? t.plural("builder.runReason.issues", issues.length)
          : runActive
            ? t("builder.runReason.active")
            : null;

  // One id per Run click: a double-click or a network retry maps to the same run server-side.
  const runLock = useRef(false);
  const runMut = useMutation({
    mutationFn: async (clientRequestId: string) => {
      if (persistence.dirty) {
        const ok = await persistence.saveNow();
        if (!ok) throw new ApiError(0, "SAVE_FAILED", t("builder.saveFailedRun"));
      }
      return api<{ run: { id: string; number: number } }>(`/api/flows/${flow.id}/runs`, { method: "POST", json: { clientRequestId } });
    },
    onSettled: () => {
      runLock.current = false;
    },
    onSuccess: ({ run: r }) => {
      setSelectedRunId(r.id);
      setDockOpen(true);
      void qc.invalidateQueries({ queryKey: ["flow-runs", flow.id] });
    },
    onError: (e) => {
      const err = e as ApiError;
      if (err.code === "INVALID_FLOW") setIssuesOpen(true);
      toast(apiErrorMessage(t, err), "danger");
    },
  });
  const startRun = useCallback(() => {
    if (runReason || runMut.isPending || runLock.current) {
      if (runReason) toast(runReason, "warning");
      return;
    }
    runLock.current = true;
    runMut.mutate(crypto.randomUUID().replace(/-/g, ""));
  }, [runReason, runMut, toast]);

  /* ───── graph editing ───── */
  const [dismissedNodeId, setDismissedNodeId] = useState<string | null>(null);
  const [keyboardNodeOpen, setKeyboardNodeOpen] = useState(false);
  const selectedNodes = nodes.filter((n) => n.selected);
  const drawerNode = selectedNodes.length === 1 && selectedNodes[0]!.id !== dismissedNodeId ? selectedNodes[0]! : null;

  const onNodesChange = useCallback(
    (changes: NodeChange<RFNode>[]) => {
      const allowed = changes.filter((c) => c.type !== "remove" && (!readOnly || c.type === "select" || c.type === "dimensions"));
      if (allowed.some((c) => c.type === "select" && c.selected)) setDismissedNodeId(null);
      setNodes((ns) => applyNodeChanges(allowed, ns));
    },
    [readOnly],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<RFEdge>[]) => {
      const allowed = changes.filter((c) => c.type !== "remove");
      setEdges((es) => applyEdgeChanges(allowed, es));
    },
    [],
  );

  const isValidConnection: IsValidConnection<RFEdge> = useCallback(
    (c) => {
      const reason = checkConnection(snapshotRef.current, { source: c.source, target: c.target, sourceHandle: c.sourceHandle, targetHandle: c.targetHandle });
      invalidReason.current = reason === null ? null : connectionReason(t, reason);
      return reason === null;
    },
    [t],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (readOnly) return;
      const reason = checkConnection(snapshotRef.current, c);
      if (reason) {
        toast(connectionReason(t, reason), "warning");
        return;
      }
      pushHistory();
      invalidReason.current = null;
      const id = edgeId(c.source, c.sourceHandle, c.target);
      setEdges((es) => [...es.map((e) => ({ ...e, selected: false })), { id, source: c.source, target: c.target, sourceHandle: c.sourceHandle ?? null, targetHandle: c.targetHandle ?? null }]);
      // The new edge draws itself in (one-shot; the class is removed right after the animation).
      setDrawnEdge(id);
      setTimeout(() => setDrawnEdge((d) => (d === id ? null : d)), 350);
    },
    [readOnly, pushHistory, toast, t],
  );

  const onConnectEnd = useCallback(() => {
    if (invalidReason.current) toast(invalidReason.current, "warning");
    invalidReason.current = null;
  }, [toast]);

  const viewportCenter = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const p = rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    return { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 };
  }, [rf]);

  // Newly added nodes play their enter animation once; the flag is dropped right after it finishes.
  const markEntering = useCallback((ids: string[]) => {
    setEntering((s) => new Set([...s, ...ids]));
    setTimeout(() => setEntering((s) => {
      const n = new Set(s);
      for (const id of ids) n.delete(id);
      return n;
    }), 250);
  }, []);

  const addNode = useCallback(
    (type: NodeType, at?: { x: number; y: number }) => {
      if (readOnly) return;
      if (TRIGGER_TYPES.includes(type) && snapshotRef.current.nodes.some((n) => TRIGGER_TYPES.includes(n.type))) {
        toast(t("builder.hasTrigger"), "warning");
        return;
      }
      pushHistory();
      let pos = at ?? viewportCenter();
      // Avoid stacking exactly on top of an existing node.
      while (snapshotRef.current.nodes.some((n) => Math.abs(n.position.x - pos.x) < 24 && Math.abs(n.position.y - pos.y) < 24)) pos = { x: pos.x + 36, y: pos.y + 36 };
      const node = createNode(type, { x: snap(pos.x), y: snap(pos.y) }, snapshotRef.current.nodes.map((n) => n.id));
      // A new node is named after its type in the UI language (the engine default is the English title).
      const label = nodeTitle(t, type);
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id: node.id, type: node.type, position: node.position, data: { label, config: node.data.config as unknown as Record<string, unknown> }, selected: true }]);
      markEntering([node.id]);
      setPaletteOpen(false);
    },
    [readOnly, pushHistory, viewportCenter, toast, t, markEntering],
  );

  const deleteSelection = useCallback(() => {
    if (readOnly) return;
    const nodeIds = new Set(nodes.filter((n) => n.selected && !exiting.has(n.id)).map((n) => n.id));
    const edgeIds = new Set(edges.filter((e) => e.selected).map((e) => e.id));
    if (nodeIds.size === 0 && edgeIds.size === 0) return;
    pushHistory();
    if (nodeIds.size === 0) {
      setEdges((es) => es.filter((e) => !edgeIds.has(e.id)));
      return;
    }
    // Fade/scale out first (motion-node-out), then remove from the graph. Undo/replace cancels the timer.
    setExiting((s) => new Set([...s, ...nodeIds]));
    deleteTimer.current = setTimeout(() => {
      deleteTimer.current = null;
      setExiting((s) => {
        const n = new Set(s);
        for (const id of nodeIds) n.delete(id);
        return n;
      });
      setNodes((ns) => ns.filter((n) => !nodeIds.has(n.id)));
      setEdges((es) => es.filter((e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target)));
    }, 160);
  }, [nodes, edges, readOnly, pushHistory, exiting]);

  const duplicateSelection = useCallback(() => {
    if (readOnly) return;
    const sel = nodes.filter((n) => n.selected && !TRIGGER_TYPES.includes(n.type));
    if (sel.length === 0) {
      if (nodes.some((n) => n.selected)) toast(t("builder.oneTrigger"), "warning");
      return;
    }
    pushHistory();
    const ids = nodes.map((n) => n.id);
    const copies: RFNode[] = sel.map((n) => {
      const id = newNodeId(ids);
      ids.push(id);
      return { id, type: n.type, position: { x: n.position.x + 24, y: n.position.y + 24 }, data: { label: t("builder.copyLabel", { label: n.data.label }).slice(0, 80), config: structuredClone(n.data.config) }, selected: true };
    });
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...copies]);
    markEntering(copies.map((c) => c.id));
  }, [nodes, readOnly, pushHistory, toast, t, markEntering]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (readOnly || !nodes.some((n) => n.selected)) return;
      pushHistory("nudge");
      setNodes((ns) => ns.map((n) => (n.selected ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)));
    },
    [nodes, readOnly, pushHistory],
  );

  const updateNode = useCallback(
    (id: string, patch: { label?: string; config?: Record<string, unknown> }) => {
      if (readOnly) return;
      pushHistory(`edit:${id}:${patch.label !== undefined ? "label" : "config"}`);
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { label: patch.label ?? n.data.label, config: patch.config ?? n.data.config } } : n)));
    },
    [readOnly, pushHistory],
  );

  const clearSelection = useCallback(() => {
    setNodes((ns) => (ns.some((n) => n.selected) ? ns.map((n) => ({ ...n, selected: false })) : ns));
    setEdges((es) => (es.some((e) => e.selected) ? es.map((e) => ({ ...e, selected: false })) : es));
  }, []);

  const selectNode = useCallback((nodeId: string) => {
    setKeyboardNodeOpen(true);
    setDismissedNodeId(null);
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === nodeId })));
    const n = rf.getNode(nodeId);
    if (n) void rf.setCenter(n.position.x + NODE_W / 2, n.position.y + NODE_H / 2, { zoom: rf.getZoom(), duration: 0 });
  }, [rf]);

  const openPalette = useCallback(() => {
    if (readOnly) return;
    setPaletteOpen(true);
    requestAnimationFrame(() => paletteInput.current?.focus());
  }, [readOnly]);

  /* ───── keyboard map (slide 15) ───── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = isTypingTarget(e.target);
      if (e.key === "Escape") {
        if (typing) {
          (e.target as HTMLElement).blur();
          return;
        }
        if (paletteOpen) setPaletteOpen(false);
        else if (issuesOpen) setIssuesOpen(false);
        else clearSelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!readOnly) void persistence.saveNow({ createVersion: true }).then((ok) => ok && toast(t("builder.savedVersion"), "success"));
        return;
      }
      if (typing) return; // Delete, Run and every other shortcut stay inactive while typing.
      if (mod && e.key === "Enter") {
        e.preventDefault();
        startRun();
      } else if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setDockOpen((o) => !o);
      } else if (mod && e.key === "0") {
        e.preventDefault();
        void rf.fitView({ padding: 0.2, duration: 0 });
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelection();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (readOnly) return;
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        if (!readOnly) redo();
      } else if (!mod && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        deleteSelection();
      } else if (!mod && e.key === "/") {
        e.preventDefault();
        openPalette();
      } else if (!mod && e.key.startsWith("Arrow")) {
        if (!nodes.some((n) => n.selected)) return;
        e.preventDefault();
        const step = e.shiftKey ? 1 : GRID;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] as [number, number] | undefined;
        if (d) nudge(d[0], d[1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, issuesOpen, readOnly, clearSelection, persistence, toast, t, startRun, rf, duplicateSelection, undo, redo, deleteSelection, openPalette, nudge, nodes]);

  /* ───── layout ───── */
  const drawerVariant = isMobile ? "sheet" : "overlay";
  const showScrim = viewportKind === "tablet" && drawerNode;
  const canvasStatus = useMemo(() => ({ steps, events: run?.events, issues: issuesByNode, readOnly, entering, exiting }), [steps, run?.events, issuesByNode, readOnly, entering, exiting]);

  const canvasColors = useCanvasColors();

  const edgesWithState = useMemo(
    () =>
      edges.map((e) => {
        const target = steps.get(e.target);
        const source = steps.get(e.source);
        const flowing = target?.status === "running" || (source?.status === "succeeded" && target?.status === "pending" && runActive);
        return { ...e, className: cx(flowing && "flowing", e.id === drawnEdge && "drawing", target?.status === "skipped" && "skipped") };
      }),
    [edges, steps, runActive, drawnEdge],
  );

  const canvas = (
    <div
      ref={canvasRef}
      className="relative min-h-0 flex-1"
      onPointerDownCapture={() => setKeyboardNodeOpen(false)}
      onKeyDownCapture={(e) => {
        if ((e.key === "Enter" || e.key === " ") && (e.target as HTMLElement).closest?.(".react-flow__node")) {
          setKeyboardNodeOpen(true);
          setDismissedNodeId(null);
        }
        // React Flow moves focused nodes with arrow keys on its own (grid-snapped), which would
        // stack with our 12px / Shift 1px nudge. Take arrows on nodes over entirely.
        if (!e.key.startsWith("Arrow") || !(e.target as HTMLElement).closest?.(".react-flow__node")) return;
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 1 : GRID;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] as [number, number] | undefined;
        if (d) nudge(d[0], d[1]);
      }}
      onDragOver={(e) => {
      if (e.dataTransfer.types.includes(DRAG_MIME)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }
    }} onDrop={(e) => {
      const type = e.dataTransfer.getData(DRAG_MIME) as NodeType;
      if (!type) return;
      e.preventDefault();
      const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(type, { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 });
    }}>
      <CanvasStatusContext.Provider value={canvasStatus}>
        <ReactFlow<RFNode, RFEdge>
          nodes={nodes}
          edges={edgesWithState}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={() => setDismissedNodeId(null)}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          onNodeDragStart={() => pushHistory()}
          defaultViewport={flow.graph.viewport}
          fitView={!flow.graph.viewport && nodes.length > 0}
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          minZoom={0.25}
          maxZoom={2}
          snapToGrid
          snapGrid={[GRID, GRID]}
          deleteKeyCode={null}
          selectionKeyCode="Shift"
          multiSelectionKeyCode={["Meta", "Control"]}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable
          zoomOnDoubleClick={false}
          aria-label={t("builder.canvasAria")}
          dir="ltr"
          attributionPosition={rtl ? "bottom-left" : "bottom-right"}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color={canvasColors.dot || "transparent"} />
          {viewportKind === "desktop" && canvasColors.minimapNode && (
            <MiniMap
              style={{ width: 160, height: 96 }}
              className="motion-fade"
              pannable
              zoomable
              nodeColor={canvasColors.minimapNode}
              nodeStrokeColor={canvasColors.minimapStroke}
              maskColor={canvasColors.minimapMask}
              position={rtl ? "bottom-right" : "bottom-left"}
              ariaLabel={t("builder.miniMap")}
            />
          )}
        </ReactFlow>
      </CanvasStatusContext.Provider>

      {/* Toolbar */}
      {!readOnly && (
        <div className="absolute top-3 start-3 z-20 flex items-center gap-2">
          <Button ref={addNodeButton} size="sm" onClick={() => (paletteOpen ? setPaletteOpen(false) : openPalette())} aria-expanded={paletteOpen} aria-haspopup="dialog">
            {t("builder.addNode")} <Kbd>/</Kbd>
          </Button>
        </div>
      )}
      {paletteOpen && (
        <NodePalette
          ref={paletteInput}
          hasTrigger={snapshot.nodes.some((n) => TRIGGER_TYPES.includes(n.type))}
          onAdd={(t) => addNode(t)}
          onClose={() => setPaletteOpen(false)}
          allowDrag={viewportKind === "desktop"}
          returnFocusTo={() => addNodeButton.current}
        />
      )}

      {/* Empty canvas */}
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="motion-enter pointer-events-auto flex max-w-xs flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface/90 px-6 py-8 text-center">
            <Zap aria-hidden className="size-6 text-muted" />
            <p className="text-lg font-semibold">{t("builder.emptyTitle")}</p>
            <p className="text-base text-med">{t("builder.emptyBody")}</p>
            <Button variant="primary" className="mt-2" onClick={() => addNode("trigger.manual")} disabledReason={readOnlyReason}>
              {t("builder.addTrigger")}
            </Button>
            <Link href={`/w/${workspace.slug}/templates`} className="text-base text-med hover:text-hi">
              {t("builder.browseTemplates")}
            </Link>
          </div>
        </div>
      )}

      <ZoomControls shifted={Boolean(drawerNode) && drawerVariant === "overlay"} />

      {showScrim && <button aria-label={t("builder.closeDrawer")} className="absolute inset-0 z-20 bg-scrim" onClick={clearSelection} />}
      {drawerNode && (
        <NodeDrawer
          key={drawerNode.id}
          node={drawerNode}
          step={steps.get(drawerNode.id)}
          runNumber={run?.number}
          readOnly={readOnly}
          readOnlyReason={readOnlyReason}
          issues={issuesByNode.get(drawerNode.id) ?? []}
          variant={drawerVariant}
          onChange={(p) => updateNode(drawerNode.id, p)}
          onDuplicate={duplicateSelection}
          onDelete={deleteSelection}
          onClose={() => setDismissedNodeId(drawerNode.id)}
          returnFocusTo={() => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(drawerNode.id)}"]`) ?? addNodeButton.current}
          initialFocus={keyboardNodeOpen && !entering.has(drawerNode.id)}
        />
      )}
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col" data-testid="builder">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-3 py-2 sm:px-4">
        <nav aria-label={t("builder.breadcrumb")} className="flex min-w-0 items-center gap-1.5 text-base">
          <Link href={`/w/${workspace.slug}/flows`} className="shrink-0 text-med hover:text-hi">
            <span aria-hidden className="flip-rtl">←</span> {t("builder.flowsCrumb")}
          </Link>
          <span className="text-muted">/</span>
          <label htmlFor="flow-name" className="sr-only">
            {t("builder.flowName")}
          </label>
          <input
            id="flow-name"
            value={name}
            readOnly={readOnly}
            maxLength={80}
            onChange={(e) => {
              pushHistory("name");
              setName(e.target.value);
            }}
            onBlur={() => !name.trim() && setName(flow.name)}
            className="min-w-0 rounded-sm bg-transparent px-1 font-semibold text-hi focus:bg-card focus:outline-none"
            style={{ width: `${Math.min(Math.max(name.length, 8), 40) + 1}ch` }}
          />
        </nav>
        <SaveBadge status={persistence.status} lastSavedAt={persistence.lastSavedAt} onRetry={persistence.retryNow} error={persistence.error} />
        {!isMobile && (
          <span className="flex items-center gap-2">
            <PublishControl flowId={flow.id} canEdit={canEditRole} dirty={persistence.dirty} saveNow={() => persistence.saveNow()} issueCount={issues.length} online={online} />
          </span>
        )}
        <div className="ms-auto flex items-center gap-2">
          {issues.length > 0 && (
            <Popover open={issuesOpen} onOpenChange={setIssuesOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="text-warning" aria-expanded={issuesOpen}>
                  <TriangleAlert aria-hidden className="size-3.5" /> {t.plural("builder.issueCount", issues.length)}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" side="bottom" className="w-80" role="dialog" ariaLabel={t("builder.issuesDialog")}>
                <ul className="flex flex-col gap-0.5">
                  {issues.map((i, k) => (
                    <li key={k}>
                      <button
                        className="w-full rounded-md px-2 py-1.5 text-start text-sm text-hi hover:bg-card disabled:cursor-default"
                        disabled={!i.nodeId}
                        onClick={() => {
                          if (i.nodeId) selectNode(i.nodeId);
                          setIssuesOpen(false);
                        }}
                      >
                        <span className="text-warning">⚠</span> {issueMessage(t, i, i.nodeId ? labelOf.get(i.nodeId) : undefined)}
                      </button>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          )}
          {!readOnly && (
            <span className="hidden items-center gap-1 lg:flex">
              <Button size="sm" variant="ghost" aria-label={t("builder.undo", { shortcut: `${modKey()}Z` })} title={t("builder.undo", { shortcut: `${modKey()}Z` })} disabledReason={history.past ? null : t("builder.nothingToUndo")} onClick={undo}>
                <Undo2 aria-hidden className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" aria-label={t("builder.redo", { shortcut: `${modKey()}⇧Z` })} title={t("builder.redo", { shortcut: `${modKey()}⇧Z` })} disabledReason={history.future ? null : t("builder.nothingToRedo")} onClick={redo}>
                <Redo2 aria-hidden className="size-4" />
              </Button>
            </span>
          )}
          {!isMobile && (
            <Button ref={historyButton} size="sm" variant="ghost" onClick={() => { setHistoryOpen((o) => !o); setCopilotOpen(false); }} aria-pressed={historyOpen}>
              {t("builder.history")}
            </Button>
          )}
          <Button ref={copilotButton} size="sm" variant="ghost" onClick={() => { setCopilotOpen((o) => !o); setHistoryOpen(false); }} aria-pressed={copilotOpen} disabledReason={readOnly ? (readOnlyReason ?? t("builder.readOnly")) : !online ? t("builder.copilotOffline") : null}>
            <Sparkles aria-hidden className="size-3.5 text-cat-ai" /> Copilot
          </Button>
          {!isMobile && (
            <Button size="sm" variant="ghost" onClick={() => setDockOpen((o) => !o)} aria-pressed={dockOpen} title={t("builder.toggleDock", { shortcut: `${modKey()}J` })}>
              {t("builder.runs")} <Kbd>{modKey()}J</Kbd>
            </Button>
          )}
          <Button variant="primary" onClick={startRun} loading={runMut.isPending} disabledReason={runReason} aria-keyshortcuts="Control+Enter Meta+Enter">
            {t("builder.run")}
          </Button>
        </div>
      </header>

      {historyOpen && !isMobile && (
        <HistoryPanel
          flowId={flow.id}
          getRevision={persistence.getRevision}
          onClose={() => setHistoryOpen(false)}
          returnFocusTo={() => historyButton.current}
          beforeRestore={async () => {
            if (persistence.dirty && !(await persistence.saveNow())) throw new Error(t("builder.saveFirst"));
          }}
        />
      )}
      {/* Mounted from its first opening on, hidden while closed: closing Copilot must not discard an unsaved proposal (see CopilotPanel). */}
      {copilotMounted && (
        <CopilotPanel
          target={{ kind: "flow", flowId: flow.id }}
          open={copilotVisible}
          onClose={() => setCopilotOpen(false)}
          returnFocusTo={() => copilotButton.current}
          beforePropose={async () => {
            if (persistence.dirty && !(await persistence.saveNow())) throw new Error(t("builder.saveFirstCopilot"));
          }}
          onApplied={() => window.location.replace(window.location.pathname)}
        />
      )}
      <PausedBanner flowId={flow.id} />
      {isMobile && (
        <div role="status" className="shrink-0 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
          {t("builder.mobileBanner")}
        </div>
      )}
      {!canEditRole && !isMobile && (
        <div role="status" className="shrink-0 border-b border-line bg-card px-4 py-2 text-sm text-med">
          {t("builder.viewerBanner")}
        </div>
      )}
      {persistence.conflict && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-danger/30 bg-danger/10 px-4 py-2.5 text-base">
          <span className="text-danger">
            {persistence.conflict.localSavedAt ? t("builder.conflictOffline") : t("builder.conflict")}
          </span>
          <span className="ms-auto flex gap-2">
            <Button size="sm" onClick={() => void persistence.resolveConflict("server")}>
              {t("builder.useSaved")}
            </Button>
            <Button size="sm" variant="primary" onClick={() => void persistence.resolveConflict("mine")}>
              {t("builder.keepMine")}
            </Button>
          </span>
        </div>
      )}

      {isMobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-[38%] min-h-48 shrink-0">{canvas}</div>
          <RunDock variant="primary" run={run} loading={runQ.isLoading} runs={runsQ.data ?? []} workspaceSlug={workspace.slug} onSelectRun={setSelectedRunId} onSelectStep={selectNode} onClose={() => {}} onCancel={() => run && cancelMut.mutate(run.id)} cancelling={cancelMut.isPending} canCancel={canEditRole} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col" style={{ minWidth: width >= 1280 ? undefined : 0 }}>
          {canvas}
          {dockOpen && (
            <RunDock variant="dock" run={run} loading={runQ.isLoading} runs={runsQ.data ?? []} workspaceSlug={workspace.slug} onSelectRun={setSelectedRunId} onSelectStep={selectNode} onClose={() => setDockOpen(false)} onCancel={() => run && cancelMut.mutate(run.id)} cancelling={cancelMut.isPending} canCancel={canEditRole} />
          )}
        </div>
      )}
    </div>
  );
}

function ZoomControls({ shifted }: { shifted: boolean }) {
  const rf = useReactFlow();
  const t = useT();
  const zoom = useStore((s) => s.transform[2]);
  return (
    <div
      className={cx(
        "absolute bottom-3 z-20 flex items-center gap-1 rounded-lg border border-line bg-surface px-1.5 py-1 text-base text-med",
        shifted ? "end-[calc(var(--drawer-w)+12px)]" : "end-3",
      )}
    >
      <button aria-label={t("builder.zoomOut")} onClick={() => void rf.zoomOut({ duration: 0 })} className="flex size-7 items-center justify-center rounded-md hover:bg-card hover:text-hi">
        <Minus aria-hidden className="size-3.5" />
      </button>
      <span className="data w-12 text-center text-sm" aria-live="polite" aria-label={t("builder.zoomLevel", { pct: Math.round(zoom * 100) })}>
        {Math.round(zoom * 100)}%
      </span>
      <button aria-label={t("builder.zoomIn")} onClick={() => void rf.zoomIn({ duration: 0 })} className="flex size-7 items-center justify-center rounded-md hover:bg-card hover:text-hi">
        <Plus aria-hidden className="size-3.5" />
      </button>
      <button onClick={() => void rf.fitView({ padding: 0.2, duration: 0 })} className="h-7 rounded-md px-2 hover:bg-card hover:text-hi" title={t("builder.fitTitle", { shortcut: `${modKey()}0` })}>
        {t("builder.fit")}
      </button>
    </div>
  );
}

const SAVE_TONE: Record<SaveStatus, string> = {
  saved: "text-muted",
  unsaved: "text-warning",
  saving: "text-med",
  retrying: "text-warning",
  failed: "text-danger",
  offline: "text-info",
  conflict: "text-danger",
  readonly: "text-muted",
};

function SaveBadge({ status, onRetry, error }: { status: SaveStatus; lastSavedAt: number | null; onRetry: () => void; error: string | null }) {
  const t = useT();
  // The check appears only on a real transition into "saved" (server-confirmed), then fades away.
  const { confirmed, flash } = useConfirm();
  const prev = useRef(status);
  useEffect(() => {
    if (status === "saved" && prev.current !== "saved") flash();
    prev.current = status;
  }, [status, flash]);
  return (
    <span className="flex items-center gap-2 text-sm" data-testid="save-status" data-status={status}>
      <span role="status" className={cx("inline-flex items-center gap-1", SAVE_TONE[status])} title={error ?? undefined}>
        {confirmed && status === "saved" && <ConfirmCheck className="text-success" />}
        {t(`builder.save.${status}`)}
      </span>
      {status === "failed" && (
        <button onClick={onRetry} className="text-accent-text underline">
          {t("builder.retry")}
        </button>
      )}
    </span>
  );
}

function BuilderHeaderShell({ slug, title }: { slug: string; title: string }) {
  const t = useT();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4 text-base">
      <Link href={`/w/${slug}/flows`} className="text-med hover:text-hi">
        <span aria-hidden className="flip-rtl">←</span> {t("builder.flowsCrumb")}
      </Link>
      <span className="text-muted">/</span>
      <span className="font-semibold">{title}</span>
    </header>
  );
}

function BuilderSkeleton({ slug }: { slug: string }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label={t("builder.loadingFlow")}>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <Link href={`/w/${slug}/flows`} className="text-base text-med hover:text-hi">
          <span aria-hidden className="flip-rtl">←</span> {t("builder.flowsCrumb")}
        </Link>
        <span className="text-muted">/</span>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="ms-auto h-8 w-20" />
      </header>
      <div className="relative flex-1 bg-[radial-gradient(var(--color-elevated)_1px,transparent_1px)] [background-size:24px_24px]">
        <div className="absolute top-1/3 start-[10%] flex gap-16">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[84px] w-[200px] rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
