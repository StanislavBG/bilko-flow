/**
 * Planner Certification and Conformance.
 *
 * Validates that planner outputs conform to the DSL specification,
 * typed step contracts, determinism semantics, and RBAC-safe behavior.
 */

import { TypedError, createTypedError } from '../domain/errors';
import { validateWorkflow } from '../dsl/validator';
import { compileWorkflow } from '../dsl/compiler';
import { isSupportedVersion } from '../dsl/version';
import { Workflow, WorkflowStatus } from '../domain/workflow';
import { DeterminismGrade } from '../domain/determinism';
import {
  Planner,
  PlannerVersionInfo,
  WorkflowProposal,
  WorkflowPatch,
} from './interface';

/** Certification result for a planner. */
export interface CertificationResult {
  passed: boolean;
  plannerInfo: PlannerVersionInfo;
  /** Individual test results. */
  tests: CertificationTest[];
  /** Errors that caused certification failure. */
  errors: TypedError[];
}

export interface CertificationTest {
  name: string;
  passed: boolean;
  error?: string;
}

/** Validate a workflow proposal from a planner. */
export function validateProposal(
  proposal: WorkflowProposal,
  accountId: string,
  projectId: string,
  environmentId: string,
): { valid: boolean; errors: TypedError[] } {
  const errors: TypedError[] = [];

  // Check spec version
  if (!isSupportedVersion(proposal.specVersion)) {
    errors.push(
      createTypedError({
        code: 'PLANNER.UNSUPPORTED_VERSION',
        message: `Planner proposed unsupported DSL version: ${proposal.specVersion}`,
        retryable: false,
      }),
    );
  }

  // Check planner declares supported versions
  if (!proposal.plannerInfo.supportedDslVersions.includes(proposal.specVersion)) {
    errors.push(
      createTypedError({
        code: 'PLANNER.VERSION_MISMATCH',
        message: 'Planner proposed a DSL version not listed in its supported versions',
        retryable: false,
      }),
    );
  }

  // Construct a workflow from the proposal to validate
  const workflow: Workflow = {
    id: 'proposal_validation',
    accountId,
    projectId,
    environmentId,
    name: proposal.name,
    description: proposal.description,
    version: 1,
    specVersion: proposal.specVersion,
    status: WorkflowStatus.Draft,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    determinism: proposal.determinism,
    entryStepId: proposal.entryStepId,
    steps: proposal.steps.map((s) => ({ ...s, workflowId: 'proposal_validation' })),
    secrets: proposal.secrets,
  };

  // Validate against DSL schema
  const validation = validateWorkflow(workflow);
  if (!validation.valid) {
    errors.push(...validation.errors);
  }

  // Compile to check for deeper issues
  if (validation.valid) {
    const compilation = compileWorkflow(workflow);
    if (!compilation.success) {
      errors.push(...compilation.errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validate a workflow patch from a planner. */
export function validatePatch(
  patch: WorkflowPatch,
  baseWorkflow: Workflow,
): { valid: boolean; errors: TypedError[] } {
  const errors: TypedError[] = [];

  // Version must match
  if (patch.baseVersion !== baseWorkflow.version) {
    errors.push(
      createTypedError({
        code: 'PLANNER.VERSION_CONFLICT',
        message: `Patch base version ${patch.baseVersion} does not match workflow version ${baseWorkflow.version}`,
        retryable: false,
      }),
    );
    return { valid: false, errors };
  }

  // Apply patch to create updated workflow
  const updatedWorkflow = applyPatch(baseWorkflow, patch);

  // Validate the result
  const validation = validateWorkflow(updatedWorkflow);
  if (!validation.valid) {
    errors.push(...validation.errors);
  }

  return { valid: errors.length === 0, errors };
}

/** Apply a patch to a workflow, producing a new version. */
export function applyPatch(workflow: Workflow, patch: WorkflowPatch): Workflow {
  let steps = [...workflow.steps];

  // Remove steps
  if (patch.removeStepIds?.length) {
    steps = steps.filter((s) => !patch.removeStepIds!.includes(s.id));
  }

  // Add steps
  if (patch.addSteps?.length) {
    steps.push(...patch.addSteps.map((s) => ({ ...s, workflowId: workflow.id })));
  }

  // Update steps
  if (patch.updateSteps) {
    steps = steps.map((s) => {
      const updates = patch.updateSteps![s.id];
      if (updates) {
        return { ...s, ...updates, id: s.id, workflowId: s.workflowId };
      }
      return s;
    });
  }

  return {
    ...workflow,
    version: workflow.version + 1,
    updatedAt: new Date().toISOString(),
    steps,
    determinism: patch.determinism ?? workflow.determinism,
    secrets: patch.secrets ?? workflow.secrets,
  };
}

/** Run the planner certification suite against a planner implementation. */
export async function certifyPlanner(planner: Planner): Promise<CertificationResult> {
  const plannerInfo = planner.getVersionInfo();
  const tests: CertificationTest[] = [];
  const errors: TypedError[] = [];

  // Test 1: Version declarations
  tests.push({
    name: 'version-declarations',
    passed:
      plannerInfo.name.length > 0 &&
      plannerInfo.version.length > 0 &&
      plannerInfo.supportedDslVersions.length > 0,
    error:
      plannerInfo.supportedDslVersions.length === 0
        ? 'Planner must declare at least one supported DSL version'
        : undefined,
  });

  // Test 2: Supported DSL versions are valid
  const allVersionsValid = plannerInfo.supportedDslVersions.every(isSupportedVersion);
  tests.push({
    name: 'supported-versions-valid',
    passed: allVersionsValid,
    error: allVersionsValid ? undefined : 'Planner declares unsupported DSL versions',
  });

  // Test 3: ProposeWorkflow produces valid output for a simple goal
  try {
    const proposal = await planner.proposeWorkflow({
      description: 'Certification test: simple transform workflow',
      targetDslVersion: '1.0.0',
      determinismTarget: { targetGrade: DeterminismGrade.Pure },
    });

    const validation = validateProposal(proposal, 'cert_acct', 'cert_proj', 'cert_env');
    tests.push({
      name: 'propose-workflow-valid',
      passed: validation.valid,
      error: validation.valid ? undefined : validation.errors.map((e) => e.message).join('; '),
    });
    if (!validation.valid) errors.push(...validation.errors);
  } catch (err) {
    tests.push({
      name: 'propose-workflow-valid',
      passed: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }

  // Test 4: ProposeRepair produces valid output
  try {
    const testWorkflow: Workflow = {
      id: 'cert_test_wf',
      accountId: 'cert_acct',
      projectId: 'cert_proj',
      environmentId: 'cert_env',
      name: 'Cert Test Workflow',
      version: 1,
      specVersion: '1.0.0',
      status: WorkflowStatus.Active,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      determinism: { targetGrade: DeterminismGrade.Pure },
      entryStepId: 'step_1',
      steps: [
        {
          id: 'step_1',
          workflowId: 'cert_test_wf',
          name: 'Test step',
          type: 'transform.map',
          dependsOn: [],
          inputs: { data: [] },
          policy: { timeoutMs: 30000, maxAttempts: 1 },
        },
      ],
      secrets: [],
    };

    const repair = await planner.proposeRepair({
      workflow: testWorkflow,
      errors: [
        createTypedError({
          code: 'STEP.EXECUTION_ERROR',
          message: 'Test error for certification',
          stepId: 'step_1',
          retryable: true,
          suggestedFixes: [{ type: 'INCREASE_TIMEOUT', params: { timeoutMs: 60000 } }],
        }),
      ],
      suggestedFixes: [
        {
          errorCode: 'STEP.EXECUTION_ERROR',
          fixes: [{ type: 'INCREASE_TIMEOUT', params: { timeoutMs: 60000 } }],
        },
      ],
    });

    const patchValidation = validatePatch(repair, testWorkflow);
    tests.push({
      name: 'propose-repair-valid',
      passed: patchValidation.valid,
      error: patchValidation.valid ? undefined : patchValidation.errors.map((e) => e.message).join('; '),
    });
    if (!patchValidation.valid) errors.push(...patchValidation.errors);
  } catch (err) {
    tests.push({
      name: 'propose-repair-valid',
      passed: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }

  const passed = tests.every((t) => t.passed);

  return {
    passed,
    plannerInfo,
    tests,
    errors,
  };
}
