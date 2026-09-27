import type { Edge, Node } from "@xyflow/react";
import type { FlowEdge, FlowGraph, FlowNode, NodeType } from "@/engine/types";

export type NodeData = { label: string; config: Record<string, unknown> };
export type RFNode = Node<NodeData, NodeType>;
export type RFEdge = Edge;

export interface Snapshot {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export function toRF(graph: FlowGraph): { nodes: RFNode[]; edges: RFEdge[] } {
  return {
    nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, position: { ...n.position }, data: { label: n.data.label, config: { ...(n.data.config as object) } } })),
    edges: graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null })),
  };
}

/** Domain snapshot without UI-only state (selection, measured sizes). */
export function toDomain(nodes: RFNode[], edges: RFEdge[]): Snapshot {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as NodeType,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: { label: n.data.label, config: n.data.config },
    })) as unknown as FlowNode[],
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null })),
  };
}

export function edgeId(source: string, sourceHandle: string | null | undefined, target: string) {
  return `e-${source}-${sourceHandle ?? "out"}-${target}`;
}
