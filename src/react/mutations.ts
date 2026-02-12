/**
 * Flow Mutations — Pure mutation engine for DAG flow editing.
 *
 * Provides a type-safe mutation protocol for adding, removing, updating,
 * connecting, disconnecting, and retyping steps. All mutations are pure
 * functions that produce new FlowDefinition objects.
 *
 * Used by CanvasBuilder and any programmatic flow editing tool.
 */

import type { FlowStep, FlowDefinition, UIStepType } from './types';

// ── Mutation Types ──────────────────────────────────────

export type FlowMutation =
  | { type: 'add-step'; step: FlowStep; afterStepId?: string }
  | { type: 'remove-step'; stepId: string }
  | { type: 'update-step'; stepId: string; changes: Partial<FlowStep> }
  | { type: 'connect'; fromId: string; toId: string }
  | { type: 'disconnect'; fromId: string; toId: string }
  | { type: 'change-type'; stepId: string; newType: UIStepType }
  | { type: 'reorder-deps'; stepId: string; newDeps: string[] }
  | { type: 'batch'; mutations: FlowMutation[]; description: string };

/** Validation error from mutation application */
export interface MutationValidationError {
  invariant: string;
  message: string;
}

/** Result of applying a mutation */
export interface MutationResult {
  flow: FlowDefinition;
  valid: boolean;
  errors: MutationValidationError[];
  description: string;
}

// ── Helpers ─────────────────────────────────────────────

/** Generate a kebab-case step ID from a name, ensuring uniqueness */
export function generateStepId(name: string, existingIds: Set<string>): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'step';

  if (!existingIds.has(base)) return base;

  let i = 2;
  while (existingIds.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** Create a blank step of the given type */
export function createBlankStep(
  type: UIStepType,
  name: string,
  existingIds: Set<string>,
  dependsOn: string[] = [],
): FlowStep {
  return {
    id: generateStepId(name, existingIds),
    name,
    type,
    description: '',
    dependsOn,
  };
}

// ── DAG Validation ──────────────────────────────────────

/** Check for cycles using Kahn's algorithm (I1: DAG invariant) */
function hasCycles(steps: FlowStep[]): boolean {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const s of steps) {
    inDegree.set(s.id, s.dependsOn.length);
    if (!adj.has(s.id)) adj.set(s.id, []);
    for (const dep of s.dependsOn) {
      if (!adj.has(dep)) adj.set(dep, []);
      adj.get(dep)!.push(s.id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited++;
    for (const next of adj.get(current) ?? []) {
      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  return visited !== steps.length;
}

/** Validate flow invariants (ARCH-005 Steel Frame) */
function validateFlow(flow: FlowDefinition): MutationValidationError[] {
  const errors: MutationValidationError[] = [];
  const idSet = new Set<string>();

  // I5: Unique IDs
  for (const step of flow.steps) {
    if (idSet.has(step.id)) {
      errors.push({ invariant: 'I5', message: `Duplicate step ID: ${step.id}` });
    }
    idSet.add(step.id);
  }

  // I6: Valid dependencies
  for (const step of flow.steps) {
    for (const dep of step.dependsOn) {
      if (!idSet.has(dep)) {
        errors.push({ invariant: 'I6', message: `Step "${step.id}" depends on unknown step "${dep}"` });
      }
    }
  }

  // I1: No cycles
  if (hasCycles(flow.steps)) {
    errors.push({ invariant: 'I1', message: 'Flow contains a cycle — must be a DAG' });
  }

  // I2: At least one root
  const hasRoot = flow.steps.some(s => s.dependsOn.length === 0);
  if (flow.steps.length > 0 && !hasRoot) {
    errors.push({ invariant: 'I2', message: 'Flow has no root step (step with zero dependencies)' });
  }

  // I3: No orphans (all non-root steps must be reachable from a root)
  if (flow.steps.length > 0) {
    const reachable = new Set<string>();
    const adj = new Map<string, string[]>();
    for (const s of flow.steps) {
      if (!adj.has(s.id)) adj.set(s.id, []);
      for (const dep of s.dependsOn) {
        if (!adj.has(dep)) adj.set(dep, []);
        adj.get(dep)!.push(s.id);
      }
    }
    const roots = flow.steps.filter(s => s.dependsOn.length === 0);
    const queue = roots.map(r => r.id);
    for (const id of queue) {
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const next of adj.get(id) ?? []) {
        queue.push(next);
      }
    }
    for (const step of flow.steps) {
      if (!reachable.has(step.id)) {
        errors.push({ invariant: 'I3', message: `Step "${step.id}" is not reachable from any root` });
      }
    }
  }

  // I7: Step completeness
  for (const step of flow.steps) {
    if (!step.name || step.name.trim() === '') {
      errors.push({ invariant: 'I7', message: `Step "${step.id}" has no name` });
    }
  }

  return errors;
}

// ── Mutation Application ────────────────────────────────

/**
 * Apply a mutation to a flow definition.
 *
 * Returns a new FlowDefinition (never mutates the input) plus
 * validation results. The caller decides whether to accept the
 * result even if validation errors exist.
 */
export function applyMutation(flow: FlowDefinition, mutation: FlowMutation): MutationResult {
  let newSteps = [...flow.steps.map(s => ({ ...s, dependsOn: [...s.dependsOn] }))];
  let description = '';

  switch (mutation.type) {
    case 'add-step': {
      newSteps.push({ ...mutation.step, dependsOn: [...mutation.step.dependsOn] });
      description = `Add step "${mutation.step.name}" (${mutation.step.type})`;
      break;
    }

    case 'remove-step': {
      const name = newSteps.find(s => s.id === mutation.stepId)?.name ?? mutation.stepId;
      newSteps = newSteps.filter(s => s.id !== mutation.stepId);
      // Remove from all dependsOn lists
      for (const s of newSteps) {
        s.dependsOn = s.dependsOn.filter(d => d !== mutation.stepId);
      }
      description = `Remove step "${name}"`;
      break;
    }

    case 'update-step': {
      const idx = newSteps.findIndex(s => s.id === mutation.stepId);
      if (idx >= 0) {
        newSteps[idx] = { ...newSteps[idx], ...mutation.changes };
        description = `Update step "${newSteps[idx].name}"`;
      } else {
        description = `Step "${mutation.stepId}" not found`;
      }
      break;
    }

    case 'connect': {
      const target = newSteps.find(s => s.id === mutation.toId);
      if (target && !target.dependsOn.includes(mutation.fromId)) {
        target.dependsOn = [...target.dependsOn, mutation.fromId];
      }
      description = `Connect ${mutation.fromId} → ${mutation.toId}`;
      break;
    }

    case 'disconnect': {
      const target = newSteps.find(s => s.id === mutation.toId);
      if (target) {
        target.dependsOn = target.dependsOn.filter(d => d !== mutation.fromId);
      }
      description = `Disconnect ${mutation.fromId} → ${mutation.toId}`;
      break;
    }

    case 'change-type': {
      const idx = newSteps.findIndex(s => s.id === mutation.stepId);
      if (idx >= 0) {
        newSteps[idx] = { ...newSteps[idx], type: mutation.newType };
        description = `Change "${newSteps[idx].name}" to ${mutation.newType}`;
      }
      break;
    }

    case 'reorder-deps': {
      const idx = newSteps.findIndex(s => s.id === mutation.stepId);
      if (idx >= 0) {
        newSteps[idx] = { ...newSteps[idx], dependsOn: [...mutation.newDeps] };
        description = `Reorder dependencies of "${newSteps[idx].name}"`;
      }
      break;
    }

    case 'batch': {
      let current: FlowDefinition = { ...flow, steps: newSteps };
      const subResults: MutationResult[] = [];
      for (const sub of mutation.mutations) {
        const result = applyMutation(current, sub);
        current = result.flow;
        subResults.push(result);
      }
      newSteps = current.steps.map(s => ({ ...s, dependsOn: [...s.dependsOn] }));
      description = mutation.description || subResults.map(r => r.description).join('; ');
      break;
    }
  }

  const newFlow: FlowDefinition = { ...flow, steps: newSteps };
  const errors = validateFlow(newFlow);

  return {
    flow: newFlow,
    valid: errors.length === 0,
    errors,
    description,
  };
}
