/**
 * DSL Validator.
 *
 * Validates workflow DSL documents against the schema and determinism rules.
 * Compilation refuses workflows with nondeterministic constructs without
 * explicit declaration.
 */

import { DeterminismGrade, DeterminismViolation } from '../domain/determinism';
import { SuggestedFix, TypedError, createTypedError } from '../domain/errors';
import { Workflow, Step } from '../domain/workflow';
import {
  VALID_STEP_TYPES,
  VALID_DETERMINISM_GRADES,
  REQUIRED_WORKFLOW_FIELDS,
  REQUIRED_STEP_FIELDS,
  REQUIRED_POLICY_FIELDS,
  SCHEMA_CONSTRAINTS,
} from './schema';
import { isSupportedVersion } from './version';

/** Validation result. */
export interface ValidationResult {
  valid: boolean;
  errors: TypedError[];
  warnings: string[];
  determinismViolations: DeterminismViolation[];
}

/** Step types that inherently use external APIs. */
const EXTERNAL_API_STEP_TYPES = new Set([
  'http.search',
  'http.request',
  'social.post',
]);

/** Step types that inherently use AI (may be nondeterministic). */
const AI_STEP_TYPES = new Set([
  'ai.summarize',
  'ai.generate-text',
  'ai.generate-image',
  'ai.generate-video',
  'ai.generate-text-local',
  'ai.summarize-local',
  'ai.embed-local',
]);

/** Validate a workflow DSL document. */
export function validateWorkflow(workflow: Partial<Workflow>): ValidationResult {
  const errors: TypedError[] = [];
  const warnings: string[] = [];
  const determinismViolations: DeterminismViolation[] = [];

  // --- Schema validation ---
  validateRequiredFields(workflow, errors);
  if (errors.length > 0) {
    return { valid: false, errors, warnings, determinismViolations };
  }

  validateSpecVersion(workflow, errors);
  validateWorkflowConstraints(workflow as Workflow, errors);
  validateSteps(workflow as Workflow, errors, warnings);
  validateStepGraph(workflow as Workflow, errors);
  validateDeterminism(workflow as Workflow, errors, warnings, determinismViolations);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    determinismViolations,
  };
}

function validateRequiredFields(workflow: Partial<Workflow>, errors: TypedError[]): void {
  for (const field of REQUIRED_WORKFLOW_FIELDS) {
    if (workflow[field] === undefined || workflow[field] === null) {
      errors.push(
        createTypedError({
          code: 'VALIDATION.REQUIRED_FIELD',
          message: `Missing required field: ${field}`,
          retryable: false,
          suggestedFixes: [
            { type: 'ADD_FIELD', params: { field }, description: `Provide the "${field}" field` },
          ],
        }),
      );
    }
  }
}

function validateSpecVersion(workflow: Partial<Workflow>, errors: TypedError[]): void {
  if (workflow.specVersion && !isSupportedVersion(workflow.specVersion)) {
    errors.push(
      createTypedError({
        code: 'VALIDATION.UNSUPPORTED_VERSION',
        message: `Unsupported DSL spec version: ${workflow.specVersion}`,
        retryable: false,
        suggestedFixes: [
          { type: 'USE_VERSION', params: { specVersion: '1.0.0' }, description: 'Use supported version 1.0.0' },
        ],
      }),
    );
  }
}

function validateWorkflowConstraints(workflow: Workflow, errors: TypedError[]): void {
  if (workflow.name && workflow.name.length > SCHEMA_CONSTRAINTS.maxWorkflowNameLength) {
    errors.push(
      createTypedError({
        code: 'VALIDATION.NAME_TOO_LONG',
        message: `Workflow name exceeds ${SCHEMA_CONSTRAINTS.maxWorkflowNameLength} characters`,
        retryable: false,
      }),
    );
  }

  if (!VALID_DETERMINISM_GRADES.includes(workflow.determinism?.targetGrade as any)) {
    errors.push(
      createTypedError({
        code: 'VALIDATION.INVALID_DETERMINISM_GRADE',
        message: `Invalid determinism grade: ${workflow.determinism?.targetGrade}`,
        retryable: false,
        suggestedFixes: [
          {
            type: 'SET_GRADE',
            params: { validGrades: [...VALID_DETERMINISM_GRADES] },
            description: 'Use a valid determinism grade',
          },
        ],
      }),
    );
  }
}

function validateSteps(workflow: Workflow, errors: TypedError[], warnings: string[]): void {
  if (!Array.isArray(workflow.steps)) {
    errors.push(
      createTypedError({
        code: 'VALIDATION.INVALID_STEPS',
        message: 'Steps must be an array',
        retryable: false,
      }),
    );
    return;
  }

  if (workflow.steps.length === 0) {
    errors.push(
      createTypedError({
        code: 'VALIDATION.EMPTY_STEPS',
        message: 'Workflow must have at least one step',
        retryable: false,
      }),
    );
    return;
  }

  if (workflow.steps.length > SCHEMA_CONSTRAINTS.maxSteps) {
    errors.push(
      createTypedError({
        code: 'VALIDATION.TOO_MANY_STEPS',
        message: `Workflow exceeds maximum of ${SCHEMA_CONSTRAINTS.maxSteps} steps`,
        retryable: false,
      }),
    );
  }

  // Validate entry step exists
  const stepIds = new Set(workflow.steps.map((s) => s.id));
  if (!stepIds.has(workflow.entryStepId)) {
    errors.push(
      createTypedError({
        code: 'VALIDATION.INVALID_ENTRY_STEP',
        message: `Entry step "${workflow.entryStepId}" not found in steps`,
        retryable: false,
        suggestedFixes: [
          {
            type: 'SET_ENTRY_STEP',
            params: { availableStepIds: [...stepIds] },
            description: 'Set entryStepId to an existing step ID',
          },
        ],
      }),
    );
  }

  // Check for duplicate step IDs
  const seenIds = new Set<string>();
  for (const step of workflow.steps) {
    if (seenIds.has(step.id)) {
      errors.push(
        createTypedError({
          code: 'VALIDATION.DUPLICATE_STEP_ID',
          message: `Duplicate step ID: ${step.id}`,
          retryable: false,
        }),
      );
    }
    seenIds.add(step.id);
  }

  // Validate each step
  for (const step of workflow.steps) {
    validateStep(step, stepIds, errors, warnings);
  }
}

function validateStep(step: Step, validStepIds: Set<string>, errors: TypedError[], warnings: string[]): void {
  // Required fields
  for (const field of REQUIRED_STEP_FIELDS) {
    if ((step as any)[field] === undefined || (step as any)[field] === null) {
      errors.push(
        createTypedError({
          code: 'VALIDATION.STEP_MISSING_FIELD',
          message: `Step "${step.id || 'unknown'}": missing required field "${field}"`,
          stepId: step.id,
          retryable: false,
        }),
      );
    }
  }

  // Step type
  if (step.type && !VALID_STEP_TYPES.includes(step.type as any)) {
    errors.push(
      createTypedError({
        code: 'VALIDATION.INVALID_STEP_TYPE',
        message: `Step "${step.id}": invalid type "${step.type}"`,
        stepId: step.id,
        retryable: false,
        suggestedFixes: [
          {
            type: 'SET_STEP_TYPE',
            params: { validTypes: [...VALID_STEP_TYPES] },
            description: 'Use a valid step type',
          },
        ],
      }),
    );
  }

  // Step name length
  if (step.name && step.name.length > SCHEMA_CONSTRAINTS.maxStepNameLength) {
    errors.push(
      createTypedError({
        code: 'VALIDATION.STEP_NAME_TOO_LONG',
        message: `Step "${step.id}": name exceeds ${SCHEMA_CONSTRAINTS.maxStepNameLength} characters`,
        stepId: step.id,
        retryable: false,
      }),
    );
  }

  // dependsOn must be an array
  if (step.dependsOn !== undefined && !Array.isArray(step.dependsOn)) {
    errors.push(
      createTypedError({
        code: 'VALIDATION.INVALID_DEPENDS_ON',
        message: `Step "${step.id}": dependsOn must be an array`,
        stepId: step.id,
        retryable: false,
      }),
    );
  }

  // Dependencies reference valid steps
  if (Array.isArray(step.dependsOn)) {
    for (const dep of step.dependsOn) {
      if (!validStepIds.has(dep)) {
        errors.push(
          createTypedError({
            code: 'VALIDATION.INVALID_DEPENDENCY',
            message: `Step "${step.id}": depends on unknown step "${dep}"`,
            stepId: step.id,
            retryable: false,
          }),
        );
      }
      if (dep === step.id) {
        errors.push(
          createTypedError({
            code: 'VALIDATION.SELF_DEPENDENCY',
            message: `Step "${step.id}": cannot depend on itself`,
            stepId: step.id,
            retryable: false,
          }),
        );
      }
    }
  }

  // Policy validation
  if (step.policy) {
    for (const field of REQUIRED_POLICY_FIELDS) {
      if ((step.policy as any)[field] === undefined) {
        errors.push(
          createTypedError({
            code: 'VALIDATION.POLICY_MISSING_FIELD',
            message: `Step "${step.id}": policy missing required field "${field}"`,
            stepId: step.id,
            retryable: false,
          }),
        );
      }
    }

    if (step.policy.timeoutMs !== undefined) {
      if (!Number.isFinite(step.policy.timeoutMs)) {
        errors.push(
          createTypedError({
            code: 'VALIDATION.INVALID_TIMEOUT',
            message: `Step "${step.id}": timeoutMs must be a finite number`,
            stepId: step.id,
            retryable: false,
          }),
        );
      } else if (step.policy.timeoutMs < SCHEMA_CONSTRAINTS.minTimeoutMs) {
        errors.push(
          createTypedError({
            code: 'VALIDATION.TIMEOUT_TOO_LOW',
            message: `Step "${step.id}": timeout must be at least ${SCHEMA_CONSTRAINTS.minTimeoutMs}ms`,
            stepId: step.id,
            retryable: false,
          }),
        );
      } else if (step.policy.timeoutMs > SCHEMA_CONSTRAINTS.maxTimeoutMs) {
        errors.push(
          createTypedError({
            code: 'VALIDATION.TIMEOUT_TOO_HIGH',
            message: `Step "${step.id}": timeout must not exceed ${SCHEMA_CONSTRAINTS.maxTimeoutMs}ms`,
            stepId: step.id,
            retryable: false,
          }),
        );
      }
    }

    if (step.policy.maxAttempts !== undefined) {
      if (!Number.isFinite(step.policy.maxAttempts) || !Number.isInteger(step.policy.maxAttempts)) {
        errors.push(
          createTypedError({
            code: 'VALIDATION.INVALID_ATTEMPTS',
            message: `Step "${step.id}": maxAttempts must be a finite integer`,
            stepId: step.id,
            retryable: false,
          }),
        );
      } else if (step.policy.maxAttempts < SCHEMA_CONSTRAINTS.minAttempts) {
        errors.push(
          createTypedError({
            code: 'VALIDATION.MIN_ATTEMPTS',
            message: `Step "${step.id}": maxAttempts must be at least ${SCHEMA_CONSTRAINTS.minAttempts}`,
            stepId: step.id,
            retryable: false,
          }),
        );
      } else if (step.policy.maxAttempts > SCHEMA_CONSTRAINTS.maxAttempts) {
        errors.push(
          createTypedError({
            code: 'VALIDATION.MAX_ATTEMPTS_EXCEEDED',
            message: `Step "${step.id}": maxAttempts must not exceed ${SCHEMA_CONSTRAINTS.maxAttempts}`,
            stepId: step.id,
            retryable: false,
          }),
        );
      }
    }
  }
}

/** Validate the step dependency graph (no cycles, reachability from entry). */
function validateStepGraph(workflow: Workflow, errors: TypedError[]): void {
  const stepMap = new Map(workflow.steps.map((s) => [s.id, s]));

  // Detect cycles using DFS
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(stepId: string): boolean {
    if (inStack.has(stepId)) return true;
    if (visited.has(stepId)) return false;

    visited.add(stepId);
    inStack.add(stepId);

    const step = stepMap.get(stepId);
    if (step) {
      for (const dep of step.dependsOn) {
        if (hasCycle(dep)) return true;
      }
    }

    inStack.delete(stepId);
    return false;
  }

  for (const step of workflow.steps) {
    if (hasCycle(step.id)) {
      errors.push(
        createTypedError({
          code: 'VALIDATION.CYCLE_DETECTED',
          message: 'Step dependency graph contains a cycle',
          retryable: false,
          suggestedFixes: [
            { type: 'REMOVE_CYCLE', params: {}, description: 'Remove circular dependencies between steps' },
          ],
        }),
      );
      break;
    }
  }

  // Check reachability: entry step should have no dependencies (it's the start)
  const entryStep = stepMap.get(workflow.entryStepId);
  if (entryStep && Array.isArray(entryStep.dependsOn) && entryStep.dependsOn.length > 0) {
    errors.push(
      createTypedError({
        code: 'VALIDATION.ENTRY_HAS_DEPENDENCIES',
        message: `Entry step "${workflow.entryStepId}" should not depend on other steps`,
        retryable: false,
        suggestedFixes: [
          {
            type: 'CLEAR_ENTRY_DEPS',
            params: { stepId: workflow.entryStepId },
            description: 'Remove dependencies from the entry step',
          },
        ],
      }),
    );
  }

  // Check forward reachability: all steps must be reachable from entry.
  // Build a forward adjacency map (step → steps that depend on it) and BFS from entry.
  const forwardEdges = new Map<string, string[]>();
  for (const step of workflow.steps) {
    if (!forwardEdges.has(step.id)) forwardEdges.set(step.id, []);
    if (Array.isArray(step.dependsOn)) {
      for (const dep of step.dependsOn) {
        const edges = forwardEdges.get(dep);
        if (edges) edges.push(step.id);
        else forwardEdges.set(dep, [step.id]);
      }
    }
  }

  const reachable = new Set<string>();
  const queue = [workflow.entryStepId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const next of (forwardEdges.get(current) ?? [])) {
      if (!reachable.has(next)) queue.push(next);
    }
  }

  for (const step of workflow.steps) {
    if (!reachable.has(step.id)) {
      errors.push(
        createTypedError({
          code: 'VALIDATION.UNREACHABLE_STEP',
          message: `Step "${step.id}" is not reachable from entry step "${workflow.entryStepId}"`,
          stepId: step.id,
          retryable: false,
          suggestedFixes: [
            { type: 'ADD_DEPENDENCY', params: { stepId: step.id }, description: 'Connect this step to the workflow graph via dependsOn' },
          ],
        }),
      );
    }
  }
}

/** Validate determinism declarations against the target grade. */
function validateDeterminism(
  workflow: Workflow,
  errors: TypedError[],
  warnings: string[],
  violations: DeterminismViolation[],
): void {
  const grade = workflow.determinism?.targetGrade;
  if (!grade) return;

  for (const step of workflow.steps) {
    // Pure grade: no external APIs, no time dependence
    if (grade === DeterminismGrade.Pure) {
      if (EXTERNAL_API_STEP_TYPES.has(step.type)) {
        const violation: DeterminismViolation = {
          stepId: step.id,
          rule: 'pure-no-external-api',
          message: `Step "${step.id}" (${step.type}) uses external APIs, incompatible with "pure" grade`,
          suggestedFix: 'Change target grade to "replayable" or "best-effort", or replace with a transform step',
        };
        violations.push(violation);
        errors.push(
          createTypedError({
            code: 'WORKFLOW.DETERMINISM_VIOLATION',
            message: violation.message,
            stepId: step.id,
            retryable: false,
            suggestedFixes: [
              { type: 'CHANGE_GRADE', params: { targetGrade: 'replayable' } },
              { type: 'CHANGE_STEP_TYPE', params: { stepId: step.id } },
            ],
          }),
        );
      }

      if (AI_STEP_TYPES.has(step.type)) {
        const violation: DeterminismViolation = {
          stepId: step.id,
          rule: 'pure-no-ai',
          message: `Step "${step.id}" (${step.type}) uses AI, which is nondeterministic, incompatible with "pure" grade`,
          suggestedFix: 'Change target grade to "replayable" or "best-effort"',
        };
        violations.push(violation);
        errors.push(
          createTypedError({
            code: 'WORKFLOW.DETERMINISM_VIOLATION',
            message: violation.message,
            stepId: step.id,
            retryable: false,
            suggestedFixes: [
              { type: 'CHANGE_GRADE', params: { targetGrade: 'replayable' } },
            ],
          }),
        );
      }

      if (step.determinism?.usesTime) {
        const violation: DeterminismViolation = {
          stepId: step.id,
          rule: 'pure-no-time',
          message: `Step "${step.id}" declares time usage, incompatible with "pure" grade`,
          suggestedFix: 'Remove time dependency or change target grade',
        };
        violations.push(violation);
        errors.push(
          createTypedError({
            code: 'WORKFLOW.DETERMINISM_VIOLATION',
            message: violation.message,
            stepId: step.id,
            retryable: false,
            suggestedFixes: [
              { type: 'CHANGE_GRADE', params: { targetGrade: 'replayable' } },
            ],
          }),
        );
      }
    }

    // Replayable grade: external APIs must declare evidence capture
    if (grade === DeterminismGrade.Replayable) {
      if (EXTERNAL_API_STEP_TYPES.has(step.type) || AI_STEP_TYPES.has(step.type)) {
        if (!step.determinism?.usesExternalApis) {
          const violation: DeterminismViolation = {
            stepId: step.id,
            rule: 'replayable-declare-external',
            message: `Step "${step.id}" (${step.type}) must declare external API usage for "replayable" grade`,
            suggestedFix: 'Add determinism.usesExternalApis=true and declare external dependencies',
          };
          violations.push(violation);
          errors.push(
            createTypedError({
              code: 'WORKFLOW.DETERMINISM_VIOLATION',
              message: violation.message,
              stepId: step.id,
              retryable: false,
              suggestedFixes: [
                {
                  type: 'DECLARE_EXTERNAL_APIS',
                  params: { stepId: step.id, usesExternalApis: true },
                  description: 'Declare external API usage and add dependency declarations',
                },
              ],
            }),
          );
        }

        if (step.determinism?.usesExternalApis && !step.determinism?.externalDependencies?.length) {
          warnings.push(
            `Step "${step.id}": declares external API usage but no external dependencies listed`,
          );
        }

        if (step.determinism?.externalDependencies) {
          for (const dep of step.determinism.externalDependencies) {
            if (dep.evidenceCapture === 'none' && !dep.deterministic) {
              const violation: DeterminismViolation = {
                stepId: step.id,
                rule: 'replayable-evidence-required',
                message: `Step "${step.id}": nondeterministic dependency "${dep.name}" must capture evidence for replay`,
                suggestedFix: 'Set evidenceCapture to "full-response" or "response-hash"',
              };
              violations.push(violation);
              errors.push(
                createTypedError({
                  code: 'WORKFLOW.DETERMINISM_VIOLATION',
                  message: violation.message,
                  stepId: step.id,
                  retryable: false,
                  suggestedFixes: [
                    {
                      type: 'SET_EVIDENCE_CAPTURE',
                      params: { dependency: dep.name, evidenceCapture: 'full-response' },
                    },
                  ],
                }),
              );
            }
          }
        }
      }

      if (step.determinism?.usesTime && step.determinism?.timeSource?.kind === 'wall-clock') {
        warnings.push(
          `Step "${step.id}": uses wall-clock time, which limits replay fidelity. Consider "pinned-run-time".`,
        );
      }
    }
  }
}
