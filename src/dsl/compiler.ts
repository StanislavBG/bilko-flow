/**
 * DSL Compiler.
 *
 * Compiles a validated workflow DSL document into an executable plan.
 * Enforces deterministic-by-construction rules for eligible workflows.
 */

import { createHash } from 'crypto';
import { DeterminismGrade, DeterminismAnalysis, DeterminismViolation } from '../domain/determinism';
import { TypedError, createTypedError, workflowCompilationError } from '../domain/errors';
import { Workflow, Step } from '../domain/workflow';
import { HashRecord } from '../domain/provenance';
import { validateWorkflow, ValidationResult } from './validator';
import { getStepHandler, InputFieldContract } from '../engine/step-runner';

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

  // Phase 3b: Handler input contract validation
  const handlerErrors = validateHandlerContracts(compiledSteps);
  if (handlerErrors.length > 0) {
    errors.push(...handlerErrors);
    return { success: false, errors, validation };
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

/**
 * Validate compiled step inputs against their registered handler's inputContract.
 *
 * This catches configuration errors at compile time — for example, a step
 * referencing a model name that doesn't exist in the handler's allowed list.
 * Only validates steps whose handlers have declared an inputContract.
 */
function validateHandlerContracts(compiledSteps: Record<string, CompiledStep>): TypedError[] {
  const errors: TypedError[] = [];

  for (const step of Object.values(compiledSteps)) {
    const handler = getStepHandler(step.type);
    if (!handler?.inputContract) continue;

    for (const [field, contract] of Object.entries(handler.inputContract)) {
      const value = step.inputs[field];

      // Check required fields
      if (contract.required && (value === undefined || value === null)) {
        errors.push(
          createTypedError({
            code: 'VALIDATION.HANDLER_CONTRACT',
            message: `Step "${step.id}": missing required input "${field}" for handler "${step.type}"`,
            stepId: step.id,
            retryable: false,
            suggestedFixes: [
              { type: 'ADD_INPUT', params: { field, stepId: step.id }, description: `Provide the "${field}" input` },
            ],
          }),
        );
        continue;
      }

      if (value === undefined || value === null) continue;

      // Check type
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== contract.type) {
        errors.push(
          createTypedError({
            code: 'VALIDATION.HANDLER_CONTRACT',
            message: `Step "${step.id}": input "${field}" must be type "${contract.type}", got "${actualType}"`,
            stepId: step.id,
            retryable: false,
          }),
        );
        continue;
      }

      // Check oneOf constraint
      if (contract.oneOf && typeof value === 'string') {
        const allowedValues = typeof contract.oneOf === 'function' ? contract.oneOf() : contract.oneOf;
        if (!allowedValues.includes(value)) {
          errors.push(
            createTypedError({
              code: 'VALIDATION.HANDLER_CONTRACT',
              message: `Step "${step.id}": input "${field}" has invalid value "${value}". Allowed: ${allowedValues.join(', ')}`,
              stepId: step.id,
              retryable: false,
              suggestedFixes: allowedValues.map((v) => ({
                type: 'SET_INPUT_VALUE',
                params: { field, value: v, stepId: step.id },
                description: `Use "${v}" for ${field}`,
              })),
            }),
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Run async validation hooks on registered step handlers.
 *
 * Call this separately from compileWorkflow() when you need
 * runtime pre-flight checks (e.g., probing model availability via HTTP).
 * compileWorkflow() itself stays synchronous for backward compatibility.
 */
export async function validateHandlers(
  compiledSteps: Record<string, CompiledStep>,
): Promise<TypedError[]> {
  const errors: TypedError[] = [];

  for (const step of Object.values(compiledSteps)) {
    const handler = getStepHandler(step.type);
    if (!handler?.validate) continue;

    const result = await handler.validate(step);
    if (!result.valid) {
      for (const errMsg of result.errors) {
        errors.push(
          createTypedError({
            code: 'VALIDATION.HANDLER_PREFLIGHT',
            message: `Step "${step.id}": ${errMsg}`,
            stepId: step.id,
            retryable: false,
            suggestedFixes: [
              { type: 'FIX_STEP_CONFIG', params: { stepId: step.id }, description: errMsg },
            ],
          }),
        );
      }
    }
  }

  return errors;
}

/** Compute SHA-256 hash of a string. */
function computeHash(data: string): HashRecord {
  const digest = createHash('sha256').update(data).digest('hex');
  return { algorithm: 'sha256', digest };
}
