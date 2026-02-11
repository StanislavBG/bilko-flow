/**
 * DAG Layout Engine
 *
 * Pure function that computes node and edge coordinates for flow
 * visualization using a Sugiyama-style algorithm:
 *   1. Kahn's topological sort for depth (column) assignment
 *   2. Barycenter heuristic for row ordering within columns
 *   3. Coordinate assignment with configurable spacing
 *
 * No React dependency — this is a pure layout computation module.
 */

import type { FlowStep } from './types';

/** Layout constants */
export const NODE_W = 220;
export const NODE_H = 72;
export const COL_GAP = 100;
export const ROW_GAP = 24;
export const PADDING = 40;

/** Computed position and size for a single node */
export interface NodeLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  column: number;
  row: number;
}

/** Computed path for an edge between two nodes */
export interface EdgeLayout {
  fromId: string;
  toId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

/** Complete layout result */
export interface DAGLayout {
  nodes: Map<string, NodeLayout>;
  edges: EdgeLayout[];
  width: number;
  height: number;
  columns: number;
  maxLaneCount: number;
}

/**
 * Compute a DAG layout for the given steps.
 *
 * Uses Kahn's algorithm for topological ordering (column assignment)
 * and barycenter heuristic for row ordering within each column.
 */
export function computeLayout(steps: FlowStep[]): DAGLayout {
  if (steps.length === 0) {
    return { nodes: new Map(), edges: [], width: 0, height: 0, columns: 0, maxLaneCount: 0 };
  }

  const stepMap = new Map(steps.map(s => [s.id, s]));

  // Phase 1: Assign columns via Kahn's topological sort
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const step of steps) {
    inDegree.set(step.id, step.dependsOn.length);
    if (!adjacency.has(step.id)) {
      adjacency.set(step.id, []);
    }
    for (const dep of step.dependsOn) {
      if (!adjacency.has(dep)) {
        adjacency.set(dep, []);
      }
      adjacency.get(dep)!.push(step.id);
    }
  }

  const columnOf = new Map<string, number>();
  const queue: string[] = [];

  for (const step of steps) {
    if ((inDegree.get(step.id) ?? 0) === 0) {
      queue.push(step.id);
      columnOf.set(step.id, 0);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const col = columnOf.get(current) ?? 0;

    for (const next of adjacency.get(current) ?? []) {
      const nextCol = Math.max(columnOf.get(next) ?? 0, col + 1);
      columnOf.set(next, nextCol);

      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) {
        queue.push(next);
      }
    }
  }

  // Handle any nodes not reached (disconnected) — place in column 0
  for (const step of steps) {
    if (!columnOf.has(step.id)) {
      columnOf.set(step.id, 0);
    }
  }

  // Phase 2: Group nodes by column
  const columns = new Map<number, string[]>();
  let maxColumn = 0;

  for (const [id, col] of columnOf) {
    if (!columns.has(col)) {
      columns.set(col, []);
    }
    columns.get(col)!.push(id);
    maxColumn = Math.max(maxColumn, col);
  }

  // Phase 3: Barycenter ordering within each column
  for (let col = 1; col <= maxColumn; col++) {
    const nodesInCol = columns.get(col) ?? [];

    const barycenter = new Map<string, number>();
    for (const nodeId of nodesInCol) {
      const step = stepMap.get(nodeId)!;
      const parentRows: number[] = [];

      for (const dep of step.dependsOn) {
        const parentCol = columns.get(columnOf.get(dep) ?? 0) ?? [];
        const parentRow = parentCol.indexOf(dep);
        if (parentRow >= 0) {
          parentRows.push(parentRow);
        }
      }

      if (parentRows.length > 0) {
        barycenter.set(nodeId, parentRows.reduce((a, b) => a + b, 0) / parentRows.length);
      } else {
        barycenter.set(nodeId, 0);
      }
    }

    nodesInCol.sort((a, b) => (barycenter.get(a) ?? 0) - (barycenter.get(b) ?? 0));
    columns.set(col, nodesInCol);
  }

  // Phase 4: Compute coordinates
  let maxLaneCount = 0;
  const nodes = new Map<string, NodeLayout>();

  for (let col = 0; col <= maxColumn; col++) {
    const nodesInCol = columns.get(col) ?? [];
    maxLaneCount = Math.max(maxLaneCount, nodesInCol.length);

    for (let row = 0; row < nodesInCol.length; row++) {
      const id = nodesInCol[row];
      nodes.set(id, {
        id,
        x: PADDING + col * (NODE_W + COL_GAP),
        y: PADDING + row * (NODE_H + ROW_GAP),
        width: NODE_W,
        height: NODE_H,
        column: col,
        row,
      });
    }
  }

  // Phase 5: Compute edges
  const edges: EdgeLayout[] = [];

  for (const step of steps) {
    const toNode = nodes.get(step.id);
    if (!toNode) continue;

    for (const dep of step.dependsOn) {
      const fromNode = nodes.get(dep);
      if (!fromNode) continue;

      edges.push({
        fromId: dep,
        toId: step.id,
        fromX: fromNode.x + fromNode.width,
        fromY: fromNode.y + fromNode.height / 2,
        toX: toNode.x,
        toY: toNode.y + toNode.height / 2,
      });
    }
  }

  // Compute total dimensions
  const width = PADDING * 2 + (maxColumn + 1) * NODE_W + maxColumn * COL_GAP;
  const height = PADDING * 2 + maxLaneCount * NODE_H + Math.max(0, maxLaneCount - 1) * ROW_GAP;

  return {
    nodes,
    edges,
    width,
    height,
    columns: maxColumn + 1,
    maxLaneCount,
  };
}
