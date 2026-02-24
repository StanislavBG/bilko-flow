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
 * Place a column's nodes centered around the average y-center of their parents.
 * Maintains ROW_GAP spacing between siblings and clamps above PADDING.
 */
function placeColumnCenteredOnParents(
  nodesInCol: string[],
  col: number,
  stepMap: Map<string, FlowStep>,
  nodes: Map<string, NodeLayout>,
): void {
  // Compute desired y-center for each node based on parent positions
  const desiredY = new Map<string, number>();
  for (const nodeId of nodesInCol) {
    const step = stepMap.get(nodeId)!;
    const parentCenters: number[] = [];
    for (const dep of step.dependsOn) {
      const parentNode = nodes.get(dep);
      if (parentNode) {
        parentCenters.push(parentNode.y + parentNode.height / 2);
      }
    }
    if (parentCenters.length > 0) {
      desiredY.set(nodeId, parentCenters.reduce((a, b) => a + b, 0) / parentCenters.length);
    } else {
      desiredY.set(nodeId, PADDING + NODE_H / 2);
    }
  }

  // Center the column block around the average desired y
  const allDesired = nodesInCol.map(id => desiredY.get(id) ?? PADDING + NODE_H / 2);
  const groupCenter = allDesired.reduce((a, b) => a + b, 0) / allDesired.length;
  const blockHeight = nodesInCol.length * NODE_H + Math.max(0, nodesInCol.length - 1) * ROW_GAP;
  const startY = Math.max(PADDING, groupCenter - blockHeight / 2);

  for (let row = 0; row < nodesInCol.length; row++) {
    const id = nodesInCol[row];
    nodes.set(id, {
      id,
      x: PADDING + col * (NODE_W + COL_GAP),
      y: startY + row * (NODE_H + ROW_GAP),
      width: NODE_W,
      height: NODE_H,
      column: col,
      row,
    });
  }
}

/**
 * Shift a column's nodes so each parent is centered on its children.
 * Resolves overlaps by pushing nodes apart while maintaining order.
 */
function shiftColumnTowardChildren(
  nodesInCol: string[],
  col: number,
  adjacency: Map<string, string[]>,
  columnOf: Map<string, number>,
  nodes: Map<string, NodeLayout>,
): void {
  if (nodesInCol.length === 0) return;

  // Compute ideal y for each node: center of its children in the next column
  const idealY = new Map<string, number>();
  for (const nodeId of nodesInCol) {
    const children = (adjacency.get(nodeId) ?? []).filter(
      childId => (columnOf.get(childId) ?? -1) === col + 1,
    );
    if (children.length > 0) {
      const childCenters = children
        .map(cid => nodes.get(cid))
        .filter((n): n is NodeLayout => n != null)
        .map(n => n.y + n.height / 2);
      if (childCenters.length > 0) {
        const avg = childCenters.reduce((a, b) => a + b, 0) / childCenters.length;
        idealY.set(nodeId, avg - NODE_H / 2);
      }
    }
  }

  // If no node has children in the next column, nothing to shift
  if (idealY.size === 0) return;

  // Build desired positions: use ideal if available, else keep current
  const desired: number[] = nodesInCol.map(id => idealY.get(id) ?? nodes.get(id)!.y);

  // Resolve overlaps: ensure minimum spacing while staying close to desired
  const resolved = resolveOverlaps(desired);

  // Apply resolved positions
  for (let i = 0; i < nodesInCol.length; i++) {
    const node = nodes.get(nodesInCol[i])!;
    nodes.set(nodesInCol[i], { ...node, y: resolved[i] });
  }
}

/**
 * Given desired y-positions (in order), resolve overlaps so nodes
 * maintain at least ROW_GAP spacing while staying as close to
 * desired positions as possible. Clamps above PADDING.
 */
function resolveOverlaps(desired: number[]): number[] {
  const n = desired.length;
  if (n === 0) return [];

  const result = [...desired];
  const minSpacing = NODE_H + ROW_GAP;

  // Forward sweep: push down any overlapping nodes
  result[0] = Math.max(PADDING, result[0]);
  for (let i = 1; i < n; i++) {
    result[i] = Math.max(result[i], result[i - 1] + minSpacing);
  }

  // Backward sweep: pull up if possible (stay close to desired)
  for (let i = n - 2; i >= 0; i--) {
    const maxAllowed = result[i + 1] - minSpacing;
    if (result[i] > maxAllowed) {
      result[i] = maxAllowed;
    }
  }

  // Final clamp
  result[0] = Math.max(PADDING, result[0]);
  for (let i = 1; i < n; i++) {
    result[i] = Math.max(result[i], result[i - 1] + minSpacing);
  }

  return result;
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

  // Phase 4: Compute coordinates — parent-centered positioning
  //
  // Two-pass approach for tree-like alignment:
  //   Forward pass (left→right): position children centered on parents.
  //   Backward pass (right→left): shift parents to center on children.
  // This eliminates the zig-zag pattern where connected nodes are at
  // very different cross-axis positions.
  let maxLaneCount = 0;
  const nodes = new Map<string, NodeLayout>();

  // Forward pass: initial placement
  // Column 0: place sequentially from top
  const col0Nodes = columns.get(0) ?? [];
  maxLaneCount = Math.max(maxLaneCount, col0Nodes.length);
  for (let row = 0; row < col0Nodes.length; row++) {
    const id = col0Nodes[row];
    nodes.set(id, {
      id,
      x: PADDING,
      y: PADDING + row * (NODE_H + ROW_GAP),
      width: NODE_W,
      height: NODE_H,
      column: 0,
      row,
    });
  }

  // Columns 1+: center children around their parents' y-positions
  for (let col = 1; col <= maxColumn; col++) {
    const nodesInCol = columns.get(col) ?? [];
    maxLaneCount = Math.max(maxLaneCount, nodesInCol.length);
    placeColumnCenteredOnParents(nodesInCol, col, stepMap, nodes);
  }

  // Backward pass: shift parents to center on their children.
  // Then re-center children on (now shifted) parents.
  // This handles cases where children couldn't center on parents
  // (e.g., PADDING clamp) — instead, parents move to match.
  for (let col = maxColumn - 1; col >= 0; col--) {
    const nodesInCol = columns.get(col) ?? [];
    shiftColumnTowardChildren(nodesInCol, col, adjacency, columnOf, nodes);
  }

  // Second forward pass: re-center children on shifted parents
  for (let col = 1; col <= maxColumn; col++) {
    const nodesInCol = columns.get(col) ?? [];
    placeColumnCenteredOnParents(nodesInCol, col, stepMap, nodes);
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

  // Compute total dimensions from actual node positions
  const width = PADDING * 2 + (maxColumn + 1) * NODE_W + maxColumn * COL_GAP;
  let maxNodeBottom = 0;
  for (const node of nodes.values()) {
    maxNodeBottom = Math.max(maxNodeBottom, node.y + node.height);
  }
  const height = maxNodeBottom + PADDING;

  return {
    nodes,
    edges,
    width,
    height,
    columns: maxColumn + 1,
    maxLaneCount,
  };
}
