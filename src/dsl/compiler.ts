/**
 * DSL Compiler.
 *
 * Compiles a validated workflow DSL document into an executable plan.
 * Enforces deterministic-by-construction rules for eligible workflows.
 */

import { createHash } from 'crypto';
import { DeterminismGrade, DeterminismAnalysis, DeterminismViolation } from '../domain/determinism';
import { TypedError, workflowCompilationError } from '../domain/errors';
import { Workflow, Step } from '../domain/workflow';
import { HashRecord } from '../domain/provenance';
import { validateWorkflow, ValidationResult } from './validator';

/** A compiled step with execution metadata. */
export interface CompiledStep {
  id: string;
  name: string;
  type: string;
  inputs: Record<string, unknown>;
  policy: {
    timeoutMs: number;
    maxAttempts: number;
    backoffStrategy: 'fixed' | 'exponential';
    backoffBaseMs: number;
  };
  /** Step implementation identifier for provenance. */
  implementationVersion: string;
  /** Resolved dependencies (step IDs that must complete first). */
  dependencies: string[];
  /** Step determinism metadata. */
  determinism: {
    pureFunction: boolean;
    usesTime: boolean;
    usesExternalApis: boolean;
  };
}

/** The compiled execution plan for a workflow run. */
export interface CompiledPlan {
  workflowId: string;
  workflowVersion: number;
  specVersion: string;
  /** Hash of the compiled plan for provenance. */
  planHash: HashRecord;
  /** Hash of the source workflow DSL. */
  workflowHash: HashRecord;
  /** Topologically sorted execution order. */
  executionOrder: string[];
  /** Compiled steps indexed by ID. */
  steps: Record<string, CompiledStep>;
  /** Determinism analysis result. */
  determinismAnalysis: DeterminismAnalysis;
  /** Compiled at timestamp. */
  compiledAt: string;
}

/** Compilation result. */
export interface CompilationResult {
  success: boolean;
  plan?: CompiledPlan;
  errors: TypedError[];
  validation: ValidationResult;
}

/** Compile a workflow DSL document into an executable plan. */
export function compileWorkflow(workflow: Workflow): CompilationResult {
  // Phase 1: Validate
  const validation = validateWorkflow(workflow);
  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors,
      validation,
    };
  }

  const errors: TypedError[] = [];

  // Phase 2: Topological sort
  const executionOrder = topologicalSort(workflow.steps);
  if (!executionOrder) {
    errors.push(
      workflowCompilationError('Failed to determine execution order: cycle detected'),
    );
    return { success: false, errors, validation };
  }

  // Phase 3: Compile steps
  const compiledSteps: Record<string, CompiledStep> = {};
  for (const step of workflow.steps) {
    compiledSteps[step.id] = compileStep(step);
  }

  // Phase 4: Determinism analysis
  const determinismAnalysis = analyzeDeterminism(workflow, validation.determinismViolations);

  // Phase 5: Compute hashes
  const workflowHash = computeHash(JSON.stringify(workflow));
  const planData = JSON.stringify({ executionOrder, steps: compiledSteps });
  const planHash = computeHash(planData);

  const plan: CompiledPlan = {
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    specVersion: workflow.specVersion || '1.0.0',
    planHash,
    workflowHash,
    executionOrder,
    steps: compiledSteps,
    determinismAnalysis,
    compiledAt: new Date().toISOString(),
  };

  return {
    success: true,
    plan,
    errors: [],
    validation,
  };
}

/** Compile a single step. */
function compileStep(step: Step): CompiledStep {
  return {
    id: step.id,
    name: step.name,
    type: step.type,
    inputs: step.inputs,
    policy: {
      timeoutMs: step.policy.timeoutMs,
      maxAttempts: step.policy.maxAttempts,
      backoffStrategy: step.policy.backoffStrategy ?? 'exponential',
      backoffBaseMs: step.policy.backoffBaseMs ?? 1000,
    },
    implementationVersion: `${step.type}@1.0.0`,
    dependencies: step.dependsOn,
    determinism: {
      pureFunction: step.determinism?.pureFunction ?? false,
      usesTime: step.determinism?.usesTime ?? false,
      usesExternalApis: step.determinism?.usesExternalApis ?? false,
    },
  };
}

/** Topological sort of steps by dependencies. Returns null if cycle detected. */
function topologicalSort(steps: Step[]): string[] | null {
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const step of steps) {
    inDegree.set(step.id, 0);
    adjacency.set(step.id, []);
  }

  // Build graph: if B depends on A, then A -> B
  for (const step of steps) {
    for (const dep of step.dependsOn) {
      adjacency.get(dep)?.push(step.id);
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return order.length === steps.length ? order : null;
}

/** Analyze determinism for a workflow. */
function analyzeDeterminism(
  workflow: Workflow,
  violations: DeterminismViolation[],
): DeterminismAnalysis {
  const targetGrade = workflow.determinism.targetGrade as DeterminismGrade;

  // Determine achievable grade based on step characteristics
  let achievableGrade = DeterminismGrade.Pure;

  for (const step of workflow.steps) {
    if (step.determinism?.usesExternalApis || step.determinism?.usesTime) {
      if (achievableGrade === DeterminismGrade.Pure) {
        achievableGrade = DeterminismGrade.Replayable;
      }
    }

    // Check if any step has nondeterministic deps without evidence capture
    if (step.determinism?.externalDependencies) {
      for (const dep of step.determinism.externalDependencies) {
        if (!dep.deterministic && dep.evidenceCapture === 'none') {
          achievableGrade = DeterminismGrade.BestEffort;
        }
      }
    }

    // AI steps with wall-clock time are best-effort
    const isAiStep = step.type.startsWith('ai.');
    if (isAiStep && step.determinism?.timeSource?.kind === 'wall-clock') {
      achievableGrade = DeterminismGrade.BestEffort;
    }
  }

  return {
    achievableGrade,
    targetGrade,
    satisfied: violations.length === 0,
    violations,
  };
}

/** Compute SHA-256 hash of a string. */
function computeHash(data: string): HashRecord {
  const digest = createHash('sha256').update(data).digest('hex');
  return { algorithm: 'sha256', digest };
}
