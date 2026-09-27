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
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createNode, newNodeId } from "@/engine/nodes";
import type { FlowGraph, NodeType } from "@/engine/types";
import { checkConnection, validateGraph } from "@/engine/validate";
import { api, ApiError } from "@/lib/api";
import { loadDraft } from "@/lib/drafts";
import { isTypingTarget, modKey, useOnline, useViewport, useWindowWidth } from "@/lib/hooks";
import { isActive, type FlowResponse, type RunDetailDto, type RunListItem } from "@/lib/types";
import { useWorkspace } from "../shell/workspace-context";
import { useToast } from "../toast";
import { Button, ErrorState, Kbd, Skeleton, cx } from "../ui";
import { CanvasStatusContext, nodeTypes } from "./flow-node";
import { edgeId, toDomain, toRF, type RFEdge, type RFNode, type Snapshot } from "./graph-utils";
import { NodeDrawer } from "./node-drawer";
import { DRAG_MIME, NodePalette } from "./palette";
import { RunDock } from "./run-dock";
import { serialize, usePersistence, type SaveStatus } from "./use-persistence";

const GRID = 12;
const NODE_W = 200;
const NODE_H = 84;
const snap = (v: number) => Math.round(v / GRID) * GRID;

export function Builder({ flowId }: { flowId: string }) {
  const { workspace } = useWorkspace();
  const q = useQuery({ queryKey: ["flow", flowId], queryFn: () => api<FlowResponse>(`/api/flows/${flowId}`), staleTime: Infinity });

  if (q.isPending) return <BuilderSkeleton slug={workspace.slug} />;
  if (q.isError) {
    const err = q.error as ApiError;
    return (
      <div className="flex h-full flex-col">
        <BuilderHeaderShell slug={workspace.slug} title={err.status === 404 ? "Flow not found" : "Flow"} />
        <div className="mx-auto mt-16 w-full max-w-md px-4">
          {err.status === 404 ? (
            <ErrorState title="This flow doesn't exist" body="It may have been deleted, or it belongs to a workspace you're not a member of." />
          ) : (
            <ErrorState title="Couldn't load this flow" body={`${err.message}. Auto-retried 3× with backoff 1s/2s/4s.`} onRetry={() => q.refetch()} retrying={q.isFetching} />
          )}
          <Link href={`/w/${workspace.slug}/flows`} className="mt-4 inline-block text-base text-accent hover:underline">
            ← Back to flows
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
  const readOnlyReason = !canEditRole ? "You have view-only access to this workspace." : isMobile ? "Editing is disabled on mobile — open this flow on a tablet or desktop to edit." : undefined;

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
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const paletteInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const invalidReason = useRef<string | null>(null);

  const snapshot = useMemo(() => toDomain(nodes, edges), [nodes, edges]);
  const issues = useMemo(() => validateGraph({ nodes: snapshot.nodes, edges: snapshot.edges }), [snapshot]);
  const issuesByNode = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const i of issues) if (i.nodeId) m.set(i.nodeId, [...(m.get(i.nodeId) ?? []), i.message]);
    return m;
  }, [issues]);

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
    if (boot.restored) toast("Restored unsaved changes from this device", "info");
  }, [boot.restored, toast]);

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
    refetchInterval: (query) => (query.state.data && isActive(query.state.data.run.status) ? 700 : false),
  });
  const run = runQ.data;
  const runActive = run ? isActive(run.status) : false;
  const prevStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevStatus.current && isActive(prevStatus.current) && run && !isActive(run.status)) {
      void qc.invalidateQueries({ queryKey: ["flow-runs", flow.id] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
      toast(run.status === "succeeded" ? `Run #${run.number} succeeded` : `Run #${run.number} failed`, run.status === "succeeded" ? "success" : "danger");
    }
    prevStatus.current = run?.status;
  }, [run, qc, flow.id, toast]);

  const steps = useMemo(() => new Map((run?.steps ?? []).map((s) => [s.nodeId, s])), [run]);

  const runReason = !online
    ? "You're offline — running needs a connection"
    : !canEditRole
      ? "Viewers can't run flows"
      : persistence.status === "conflict"
        ? "Resolve the save conflict first"
        : issues.length > 0
          ? `Fix ${issues.length} issue${issues.length > 1 ? "s" : ""} before running`
          : runActive
            ? "A run is already in progress"
            : null;

  const runMut = useMutation({
    mutationFn: async () => {
      if (persistence.dirty) {
        const ok = await persistence.saveNow();
        if (!ok) throw new ApiError(0, "SAVE_FAILED", "Couldn't save your latest changes, so the run didn't start");
      }
      return api<{ run: { id: string; number: number } }>(`/api/flows/${flow.id}/runs`, { method: "POST", json: {} });
    },
    onSuccess: ({ run: r }) => {
      setSelectedRunId(r.id);
      setDockOpen(true);
      void qc.invalidateQueries({ queryKey: ["flow-runs", flow.id] });
    },
    onError: (e) => {
      const err = e as ApiError;
      if (err.code === "INVALID_FLOW") setIssuesOpen(true);
      toast(err.message, "danger");
    },
  });
  const startRun = useCallback(() => {
    if (runReason || runMut.isPending) {
      if (runReason) toast(runReason, "warning");
      return;
    }
    runMut.mutate();
  }, [runReason, runMut, toast]);

  /* ───── graph editing ───── */
  const selectedNodes = nodes.filter((n) => n.selected);
  const drawerNode = selectedNodes.length === 1 ? selectedNodes[0]! : null;

  const onNodesChange = useCallback(
    (changes: NodeChange<RFNode>[]) => {
      const allowed = changes.filter((c) => c.type !== "remove" && (!readOnly || c.type === "select" || c.type === "dimensions"));
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
      invalidReason.current = reason;
      return reason === null;
    },
    [],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (readOnly) return;
      const reason = checkConnection(snapshotRef.current, c);
      if (reason) {
        toast(reason, "warning");
        return;
      }
      pushHistory();
      invalidReason.current = null;
      setEdges((es) => [...es.map((e) => ({ ...e, selected: false })), { id: edgeId(c.source, c.sourceHandle, c.target), source: c.source, target: c.target, sourceHandle: c.sourceHandle ?? null, targetHandle: c.targetHandle ?? null }]);
    },
    [readOnly, pushHistory, toast],
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

  const addNode = useCallback(
    (type: NodeType, at?: { x: number; y: number }) => {
      if (readOnly) return;
      if (type === "trigger.manual" && snapshotRef.current.nodes.some((n) => n.type === "trigger.manual")) {
        toast("This flow already has a trigger", "warning");
        return;
      }
      pushHistory();
      let pos = at ?? viewportCenter();
      // Avoid stacking exactly on top of an existing node.
      while (snapshotRef.current.nodes.some((n) => Math.abs(n.position.x - pos.x) < 24 && Math.abs(n.position.y - pos.y) < 24)) pos = { x: pos.x + 36, y: pos.y + 36 };
      const node = createNode(type, { x: snap(pos.x), y: snap(pos.y) }, snapshotRef.current.nodes.map((n) => n.id));
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id: node.id, type: node.type, position: node.position, data: { label: node.data.label, config: node.data.config as unknown as Record<string, unknown> }, selected: true }]);
      setPaletteOpen(false);
    },
    [readOnly, pushHistory, viewportCenter, toast],
  );

  const deleteSelection = useCallback(() => {
    if (readOnly) return;
    const nodeIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    const edgeIds = new Set(edges.filter((e) => e.selected).map((e) => e.id));
    if (nodeIds.size === 0 && edgeIds.size === 0) return;
    pushHistory();
    setNodes((ns) => ns.filter((n) => !nodeIds.has(n.id)));
    setEdges((es) => es.filter((e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target)));
  }, [nodes, edges, readOnly, pushHistory]);

  const duplicateSelection = useCallback(() => {
    if (readOnly) return;
    const sel = nodes.filter((n) => n.selected && n.type !== "trigger.manual");
    if (sel.length === 0) {
      if (nodes.some((n) => n.selected)) toast("A flow can only have one trigger", "warning");
      return;
    }
    pushHistory();
    const ids = nodes.map((n) => n.id);
    const copies: RFNode[] = sel.map((n) => {
      const id = newNodeId(ids);
      ids.push(id);
      return { id, type: n.type, position: { x: n.position.x + 24, y: n.position.y + 24 }, data: { label: `${n.data.label} copy`.slice(0, 80), config: structuredClone(n.data.config) }, selected: true };
    });
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...copies]);
  }, [nodes, readOnly, pushHistory, toast]);

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
        if (!readOnly) void persistence.saveNow({ createVersion: true }).then((ok) => ok && toast("Saved a new version", "success"));
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
  }, [paletteOpen, issuesOpen, readOnly, clearSelection, persistence, toast, startRun, rf, duplicateSelection, undo, redo, deleteSelection, openPalette, nudge, nodes]);

  /* ───── layout ───── */
  const drawerVariant = isMobile ? "sheet" : "overlay";
  const showScrim = viewportKind === "tablet" && drawerNode;
  const canvasStatus = useMemo(() => ({ steps, issues: issuesByNode, readOnly }), [steps, issuesByNode, readOnly]);

  const edgesWithState = useMemo(
    () =>
      edges.map((e) => {
        const target = steps.get(e.target);
        const source = steps.get(e.source);
        const flowing = target?.status === "running" || (source?.status === "succeeded" && target?.status === "pending" && runActive);
        return { ...e, className: cx(flowing && "flowing", target?.status === "skipped" && "skipped") };
      }),
    [edges, steps, runActive],
  );

  const canvas = (
    <div
      ref={canvasRef}
      className="relative min-h-0 flex-1"
      onKeyDownCapture={(e) => {
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
          aria-label="Flow canvas"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#27272a" />
          {viewportKind === "desktop" && <MiniMap style={{ width: 160, height: 96 }} pannable zoomable nodeColor="#27272a" nodeStrokeColor="#3f3f46" maskColor="rgba(9,9,11,0.7)" position="bottom-left" ariaLabel="Mini map" />}
        </ReactFlow>
      </CanvasStatusContext.Provider>

      {/* Toolbar */}
      {!readOnly && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
          <Button size="sm" onClick={() => (paletteOpen ? setPaletteOpen(false) : openPalette())} aria-expanded={paletteOpen} aria-haspopup="dialog">
            + Add node <Kbd>/</Kbd>
          </Button>
        </div>
      )}
      {paletteOpen && <NodePalette ref={paletteInput} hasTrigger={snapshot.nodes.some((n) => n.type === "trigger.manual")} onAdd={(t) => addNode(t)} onClose={() => setPaletteOpen(false)} allowDrag={viewportKind === "desktop"} />}

      {/* Empty canvas */}
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="pointer-events-auto flex max-w-xs flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface/90 px-6 py-8 text-center">
            <span aria-hidden className="text-2xl text-muted">⚡</span>
            <p className="text-lg font-semibold">Start with a trigger</p>
            <p className="text-base text-med">Every flow begins with an event. Add a manual trigger, then connect transforms, conditions and outputs.</p>
            <Button variant="primary" className="mt-2" onClick={() => addNode("trigger.manual")} disabledReason={readOnlyReason}>
              + Add a trigger
            </Button>
            <Link href={`/w/${workspace.slug}/templates`} className="text-base text-med hover:text-hi">
              or browse templates
            </Link>
          </div>
        </div>
      )}

      <ZoomControls shifted={Boolean(drawerNode) && drawerVariant === "overlay"} />

      {showScrim && <button aria-label="Close drawer" className="absolute inset-0 z-20 bg-black/50" onClick={clearSelection} />}
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
          onClose={clearSelection}
        />
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="builder">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-3 py-2 sm:px-4">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-base">
          <Link href={`/w/${workspace.slug}/flows`} className="shrink-0 text-med hover:text-hi">
            ← Flows
          </Link>
          <span className="text-muted">/</span>
          <label htmlFor="flow-name" className="sr-only">
            Flow name
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
        <div className="ml-auto flex items-center gap-2">
          {issues.length > 0 && (
            <div className="relative">
              <Button size="sm" variant="ghost" className="text-warning" onClick={() => setIssuesOpen((o) => !o)} aria-expanded={issuesOpen}>
                ⚠ {issues.length} issue{issues.length > 1 ? "s" : ""}
              </Button>
              {issuesOpen && (
                <div role="dialog" aria-label="Flow issues" className="absolute top-full right-0 z-40 mt-1 w-80 animate-fade-in rounded-lg border border-line bg-elevated p-2 shadow-[var(--shadow-popover)]">
                  <ul className="flex flex-col gap-0.5">
                    {issues.map((i, k) => (
                      <li key={k}>
                        <button
                          className="w-full rounded-md px-2 py-1.5 text-left text-sm text-hi hover:bg-card disabled:cursor-default"
                          disabled={!i.nodeId}
                          onClick={() => {
                            if (i.nodeId) selectNode(i.nodeId);
                            setIssuesOpen(false);
                          }}
                        >
                          <span className="text-warning">⚠</span> {i.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {!readOnly && (
            <span className="hidden items-center gap-1 lg:flex">
              <Button size="sm" variant="ghost" aria-label={`Undo (${modKey()}Z)`} title={`Undo (${modKey()}Z)`} disabledReason={history.past ? null : "Nothing to undo"} onClick={undo}>
                ↶
              </Button>
              <Button size="sm" variant="ghost" aria-label={`Redo (${modKey()}⇧Z)`} title={`Redo (${modKey()}⇧Z)`} disabledReason={history.future ? null : "Nothing to redo"} onClick={redo}>
                ↷
              </Button>
            </span>
          )}
          {!isMobile && (
            <Button size="sm" variant="ghost" onClick={() => setDockOpen((o) => !o)} aria-pressed={dockOpen} title={`Toggle run dock (${modKey()}J)`}>
              Runs <Kbd>{modKey()}J</Kbd>
            </Button>
          )}
          <Button variant="primary" onClick={startRun} loading={runMut.isPending} disabledReason={runReason} aria-keyshortcuts="Control+Enter Meta+Enter">
            ▶ Run
          </Button>
        </div>
      </header>

      {isMobile && (
        <div role="status" className="shrink-0 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
          Editing is disabled on mobile. You can run this flow and monitor results; open it on a larger screen to edit.
        </div>
      )}
      {!canEditRole && !isMobile && (
        <div role="status" className="shrink-0 border-b border-line bg-card px-4 py-2 text-sm text-med">
          View only — you&apos;re a viewer in this workspace.
        </div>
      )}
      {persistence.conflict && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-danger/30 bg-danger/10 px-4 py-2.5 text-base">
          <span className="text-danger">
            ⚠ This flow changed elsewhere{persistence.conflict.localSavedAt ? " while you were offline" : ""}. Your edits are kept on this device and have not been saved.
          </span>
          <span className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => void persistence.resolveConflict("server")}>
              Use saved version
            </Button>
            <Button size="sm" variant="primary" onClick={() => void persistence.resolveConflict("mine")}>
              Keep my version
            </Button>
          </span>
        </div>
      )}

      {isMobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-[38%] min-h-48 shrink-0">{canvas}</div>
          <RunDock variant="primary" run={run} loading={runQ.isLoading} runs={runsQ.data ?? []} workspaceSlug={workspace.slug} onSelectRun={setSelectedRunId} onSelectStep={selectNode} onClose={() => {}} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col" style={{ minWidth: width >= 1280 ? undefined : 0 }}>
          {canvas}
          {dockOpen && (
            <RunDock variant="dock" run={run} loading={runQ.isLoading} runs={runsQ.data ?? []} workspaceSlug={workspace.slug} onSelectRun={setSelectedRunId} onSelectStep={selectNode} onClose={() => setDockOpen(false)} />
          )}
        </div>
      )}
    </div>
  );
}

function ZoomControls({ shifted }: { shifted: boolean }) {
  const rf = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  return (
    <div
      className={cx(
        "absolute bottom-3 z-20 flex items-center gap-1 rounded-lg border border-line bg-surface px-1.5 py-1 text-base text-med",
        shifted ? "right-[calc(var(--drawer-w)+12px)]" : "right-3",
      )}
    >
      <button aria-label="Zoom out" onClick={() => void rf.zoomOut({ duration: 0 })} className="flex size-7 items-center justify-center rounded-md hover:bg-card hover:text-hi">
        −
      </button>
      <span className="data w-12 text-center text-sm" aria-live="polite" aria-label={`Zoom ${Math.round(zoom * 100)}%`}>
        {Math.round(zoom * 100)}%
      </span>
      <button aria-label="Zoom in" onClick={() => void rf.zoomIn({ duration: 0 })} className="flex size-7 items-center justify-center rounded-md hover:bg-card hover:text-hi">
        +
      </button>
      <button onClick={() => void rf.fitView({ padding: 0.2, duration: 0 })} className="h-7 rounded-md px-2 hover:bg-card hover:text-hi" title={`Fit canvas (${modKey()}0)`}>
        Fit
      </button>
    </div>
  );
}

const SAVE_LABEL: Record<SaveStatus, { text: string; cls: string }> = {
  saved: { text: "Saved", cls: "text-muted" },
  unsaved: { text: "● Unsaved", cls: "text-warning" },
  saving: { text: "Saving…", cls: "text-med" },
  retrying: { text: "Failed to save — retrying", cls: "text-warning" },
  failed: { text: "Failed to save", cls: "text-danger" },
  offline: { text: "● Offline — kept on this device", cls: "text-info" },
  conflict: { text: "● Not saved — conflict", cls: "text-danger" },
  readonly: { text: "View only", cls: "text-muted" },
};

function SaveBadge({ status, onRetry, error }: { status: SaveStatus; lastSavedAt: number | null; onRetry: () => void; error: string | null }) {
  const s = SAVE_LABEL[status];
  return (
    <span className="flex items-center gap-2 text-sm" data-testid="save-status" data-status={status}>
      <span role="status" className={s.cls} title={error ?? undefined}>
        {s.text}
      </span>
      {status === "failed" && (
        <button onClick={onRetry} className="text-accent underline">
          Retry
        </button>
      )}
    </span>
  );
}

function BuilderHeaderShell({ slug, title }: { slug: string; title: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4 text-base">
      <Link href={`/w/${slug}/flows`} className="text-med hover:text-hi">
        ← Flows
      </Link>
      <span className="text-muted">/</span>
      <span className="font-semibold">{title}</span>
    </header>
  );
}

function BuilderSkeleton({ slug }: { slug: string }) {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading flow">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <Link href={`/w/${slug}/flows`} className="text-base text-med hover:text-hi">
          ← Flows
        </Link>
        <span className="text-muted">/</span>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="ml-auto h-8 w-20" />
      </header>
      <div className="relative flex-1 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px]">
        <div className="absolute top-1/3 left-[10%] flex gap-16">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[84px] w-[200px] rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
