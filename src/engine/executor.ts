/**
 * Workflow Executor — the core orchestration engine.
 *
 * Executes compiled workflow plans with durable state transitions,
 * scheduling, retries, step-level policies, provenance tracking,
 * and run-time event publication.
 */

import { v4 as uuid } from 'uuid';
import { createHash } from 'crypto';
import { TenantScope } from '../domain/account';
import { DeterminismGrade } from '../domain/determinism';
import { Run, RunStatus, StepRunStatus, StepRunResult, CreateRunInput } from '../domain/run';
import { Workflow } from '../domain/workflow';
import { Provenance, HashRecord, TranscriptEntry } from '../domain/provenance';
import { Attestation, AttestationStatus } from '../domain/attestation';
import { TypedError, createTypedError, notFoundError, secretMissingError } from '../domain/errors';
import { CompiledPlan, compileWorkflow } from '../dsl/compiler';
import { Store } from '../storage/store';
import { transitionRunStatus, transitionStepStatus, isTerminalStepStatus } from './state-machine';
import { executeStep, StepExecutionContext } from './step-runner';
import { DataPlanePublisher } from '../data-plane/publisher';

/** Executor configuration. */
export interface ExecutorConfig {
  /** Whether to generate attestations after successful runs. */
  generateAttestations: boolean;
}

const DEFAULT_CONFIG: ExecutorConfig = {
  generateAttestations: true,
};

/** The workflow executor. */
export class WorkflowExecutor {
  private config: ExecutorConfig;
  private canceledRuns = new Set<string>();

  constructor(
    private store: Store,
    private publisher: DataPlanePublisher,
    config?: Partial<ExecutorConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Create and start a new run. */
  async createRun(input: CreateRunInput): Promise<Run> {
    const scope: TenantScope = {
      accountId: input.accountId,
      projectId: input.projectId,
      environmentId: input.environmentId,
    };

    // Fetch workflow
    const workflow = await this.store.workflows.getById(input.workflowId, scope);
    if (!workflow) {
      throw new ExecutorError(notFoundError('Workflow', input.workflowId));
    }

    // Use specified version or latest
    const targetVersion = input.workflowVersion ?? workflow.version;
    const versionedWorkflow =
      targetVersion !== workflow.version
        ? await this.store.workflows.getByIdAndVersion(input.workflowId, targetVersion, scope)
        : workflow;

    if (!versionedWorkflow) {
      throw new ExecutorError(notFoundError('Workflow version', `${input.workflowId}@${targetVersion}`));
    }

    // Validate required secrets
    for (const req of versionedWorkflow.secrets) {
      if (req.required && !input.secretOverrides?.[req.key]) {
        throw new ExecutorError(secretMissingError(req.key));
      }
    }

    // Compile workflow
    const compilation = compileWorkflow(versionedWorkflow);
    if (!compilation.success || !compilation.plan) {
      throw new ExecutorError(
        createTypedError({
          code: 'WORKFLOW.COMPILATION',
          message: 'Workflow compilation failed',
          retryable: false,
          details: { errors: compilation.errors },
        }),
      );
    }

    // Create run record
    const now = new Date().toISOString();
    const run: Run = {
      id: `run_${uuid()}`,
      workflowId: input.workflowId,
      workflowVersion: targetVersion,
      accountId: input.accountId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      status: RunStatus.Created,
      createdAt: now,
      updatedAt: now,
      stepResults: {},
      inputs: input.inputs,
    };

    // Initialize step results
    for (const stepId of compilation.plan.executionOrder) {
      run.stepResults[stepId] = {
        stepId,
        status: StepRunStatus.Pending,
        attempts: 0,
      };
    }

    await this.store.runs.create(run);
    await this.publisher.publishRunEvent(run, 'run.created');

    return run;
  }

  /** Execute a run (moves through queued -> running -> terminal). */
  async executeRun(runId: string, scope: TenantScope, secretValues?: Record<string, string>): Promise<Run> {
    let run = await this.store.runs.getById(runId, scope);
    if (!run) {
      throw new ExecutorError(notFoundError('Run', runId));
    }

    // Transition to queued
    run = await this.transitionRun(run, RunStatus.Queued);
    await this.publisher.publishRunEvent(run, 'run.queued');

    // Fetch and compile workflow
    const workflow = await this.store.workflows.getByIdAndVersion(
      run.workflowId,
      run.workflowVersion,
      scope,
    );
    if (!workflow) {
      throw new ExecutorError(notFoundError('Workflow', run.workflowId));
    }

    const compilation = compileWorkflow(workflow);
    if (!compilation.success || !compilation.plan) {
      run = await this.failRun(run, createTypedError({
        code: 'WORKFLOW.COMPILATION',
        message: 'Workflow compilation failed at execution time',
        retryable: false,
      }));
      return run;
    }

    // Transition to running
    run = await this.transitionRun(run, RunStatus.Running);
    run.startedAt = new Date().toISOString();
    await this.store.runs.update(run.id, run);
    await this.publisher.publishRunEvent(run, 'run.started');

    // Execute steps in topological order
    const transcript: TranscriptEntry[] = [];
    const stepOutputs: Record<string, Record<string, unknown>> = {};

    for (const stepId of compilation.plan.executionOrder) {
      if (this.canceledRuns.has(runId)) {
        run = await this.cancelRunInternal(run);
        return run;
      }

      const compiledStep = compilation.plan.steps[stepId];
      if (!compiledStep) continue;

      // Check all dependencies succeeded
      const depsOk = compiledStep.dependencies.every(
        (dep) => run!.stepResults[dep]?.status === StepRunStatus.Succeeded,
      );
      if (!depsOk) {
        run.stepResults[stepId] = {
          stepId,
          status: StepRunStatus.Canceled,
          attempts: 0,
        };
        transcript.push({
          stepId,
          timestamp: new Date().toISOString(),
          action: 'canceled',
        });
        continue;
      }

      // Transition step to running
      run.stepResults[stepId] = {
        stepId,
        status: StepRunStatus.Running,
        startedAt: new Date().toISOString(),
        attempts: 0,
      };
      await this.store.runs.update(run.id, run);
      await this.publisher.publishStepEvent(run, stepId, 'step.started');

      transcript.push({
        stepId,
        timestamp: new Date().toISOString(),
        action: 'started',
        policiesApplied: [
          `timeout:${compiledStep.policy.timeoutMs}ms`,
          `retries:${compiledStep.policy.maxAttempts}`,
        ],
      });

      // Execute the step
      const context: StepExecutionContext = {
        runId: run.id,
        accountId: run.accountId,
        projectId: run.projectId,
        environmentId: run.environmentId,
        secrets: secretValues ?? {},
        upstreamOutputs: stepOutputs,
        canceled: this.canceledRuns.has(runId),
      };

      const result = await executeStep(compiledStep, context);
      run.stepResults[stepId] = result;
      await this.store.runs.update(run.id, run);

      if (result.status === StepRunStatus.Succeeded) {
        if (result.outputs) {
          stepOutputs[stepId] = result.outputs;
        }
        transcript.push({
          stepId,
          timestamp: new Date().toISOString(),
          action: 'completed',
          durationMs: result.durationMs,
          outputHash: result.outputs ? computeHash(JSON.stringify(result.outputs)) : undefined,
        });
        await this.publisher.publishStepEvent(run, stepId, 'step.succeeded');
      } else if (result.status === StepRunStatus.Failed) {
        transcript.push({
          stepId,
          timestamp: new Date().toISOString(),
          action: 'failed',
          durationMs: result.durationMs,
        });
        await this.publisher.publishStepEvent(run, stepId, 'step.failed');

        // Fail the run
        run = await this.failRun(run, result.error ?? createTypedError({
          code: 'STEP.UNKNOWN_FAILURE',
          message: `Step "${stepId}" failed`,
          stepId,
          retryable: false,
        }));
        return run;
      } else if (result.status === StepRunStatus.Canceled) {
        transcript.push({
          stepId,
          timestamp: new Date().toISOString(),
          action: 'canceled',
        });
        run = await this.cancelRunInternal(run);
        return run;
      }
    }

    // All steps succeeded — transition run to succeeded
    run.status = RunStatus.Succeeded;
    run.completedAt = new Date().toISOString();
    run.determinismGrade = compilation.plan.determinismAnalysis.achievableGrade;
    await this.store.runs.update(run.id, run);
    await this.publisher.publishRunEvent(run, 'run.succeeded');

    // Generate provenance
    await this.generateProvenance(run, workflow, compilation.plan, transcript);

    // Generate attestation if configured
    if (this.config.generateAttestations) {
      await this.generateAttestation(run, compilation.plan);
    }

    return run;
  }

  /** Cancel a run. */
  async cancelRun(runId: string, scope: TenantScope, canceledBy: string, reason?: string): Promise<Run> {
    const run = await this.store.runs.getById(runId, scope);
    if (!run) {
      throw new ExecutorError(notFoundError('Run', runId));
    }

    this.canceledRuns.add(runId);
    run.canceledBy = canceledBy;
    run.cancelReason = reason;

    if (run.status === RunStatus.Running) {
      // Running runs will be canceled by the execution loop
      return run;
    }

    return this.cancelRunInternal(run);
  }

  /** Test a workflow without a full production run. */
  async testWorkflow(
    workflow: Workflow,
    scope: TenantScope,
  ): Promise<{ valid: boolean; compilation: { success: boolean; errors: TypedError[] }; determinism?: any }> {
    const compilation = compileWorkflow(workflow);
    return {
      valid: compilation.validation.valid,
      compilation: {
        success: compilation.success,
        errors: compilation.errors,
      },
      determinism: compilation.plan?.determinismAnalysis,
    };
  }

  private async transitionRun(run: Run, target: RunStatus): Promise<Run> {
    const result = transitionRunStatus(run.status, target);
    if (!result.success) {
      throw new ExecutorError(result.error!);
    }
    run.status = target;
    run.updatedAt = new Date().toISOString();
    await this.store.runs.update(run.id, run);
    return run;
  }

  private async failRun(run: Run, error: TypedError): Promise<Run> {
    run.status = RunStatus.Failed;
    run.error = error;
    run.completedAt = new Date().toISOString();
    run.updatedAt = new Date().toISOString();
    await this.store.runs.update(run.id, run);
    await this.publisher.publishRunEvent(run, 'run.failed');
    return run;
  }

  private async cancelRunInternal(run: Run): Promise<Run> {
    run.status = RunStatus.Canceled;
    run.canceledAt = new Date().toISOString();
    run.completedAt = new Date().toISOString();
    run.updatedAt = new Date().toISOString();

    // Cancel all pending/running steps
    for (const [stepId, result] of Object.entries(run.stepResults)) {
      if (result.status === StepRunStatus.Pending || result.status === StepRunStatus.Running) {
        run.stepResults[stepId] = {
          ...result,
          status: StepRunStatus.Canceled,
          completedAt: new Date().toISOString(),
        };
      }
    }

    await this.store.runs.update(run.id, run);
    await this.publisher.publishRunEvent(run, 'run.canceled');
    this.canceledRuns.delete(run.id);
    return run;
  }

  private async generateProvenance(
    run: Run,
    workflow: Workflow,
    plan: CompiledPlan,
    transcript: TranscriptEntry[],
  ): Promise<void> {
    const scope: TenantScope = {
      accountId: run.accountId,
      projectId: run.projectId,
      environmentId: run.environmentId,
    };

    const inputHashes: Record<string, HashRecord> = {};
    for (const [stepId, result] of Object.entries(run.stepResults)) {
      if (result.outputs) {
        inputHashes[stepId] = computeHash(JSON.stringify(result.outputs));
      }
    }

    const provenance: Provenance = {
      id: `prov_${uuid()}`,
      runId: run.id,
      workflowId: run.workflowId,
      workflowVersion: run.workflowVersion,
      accountId: run.accountId,
      projectId: run.projectId,
      environmentId: run.environmentId,
      createdAt: new Date().toISOString(),
      determinismGrade: run.determinismGrade ?? DeterminismGrade.BestEffort,
      workflowHash: plan.workflowHash,
      compiledPlanHash: plan.planHash,
      inputHashes,
      secretProvenance: [],
      stepImages: Object.values(plan.steps).map((s) => ({
        stepId: s.id,
        imageDigest: computeHash(s.implementationVersion).digest,
        implementationVersion: s.implementationVersion,
      })),
      transcript,
      artifactHashes: {},
    };

    await this.store.provenance.create(provenance);
    run.provenanceId = provenance.id;
    await this.store.runs.update(run.id, run);
    await this.publisher.publishEvent({
      id: `evt_${uuid()}`,
      type: 'provenance.recorded',
      schemaVersion: '1.0.0',
      timestamp: new Date().toISOString(),
      ...scope,
      runId: run.id,
      payload: { provenanceId: provenance.id },
    });
  }

  private async generateAttestation(run: Run, plan: CompiledPlan): Promise<void> {
    const scope: TenantScope = {
      accountId: run.accountId,
      projectId: run.projectId,
      environmentId: run.environmentId,
    };

    const artifactHashes: Record<string, HashRecord> = {};
    const stepImageDigests: Record<string, string> = {};
    for (const [stepId, compiledStep] of Object.entries(plan.steps)) {
      stepImageDigests[stepId] = computeHash(compiledStep.implementationVersion).digest;
    }

    const inputHashes: Record<string, HashRecord> = {};
    for (const [stepId, result] of Object.entries(run.stepResults)) {
      if (result.outputs) {
        inputHashes[stepId] = computeHash(JSON.stringify(result.outputs));
      }
    }

    const attestation: Attestation = {
      id: `att_${uuid()}`,
      runId: run.id,
      ...scope,
      status: AttestationStatus.Issued,
      subject: {
        runId: run.id,
        workflowId: run.workflowId,
        workflowVersion: run.workflowVersion,
        provenanceId: run.provenanceId ?? '',
      },
      statement: {
        workflowHash: plan.workflowHash,
        inputHashes,
        stepImageDigests,
        artifactHashes,
        determinismGrade: run.determinismGrade ?? DeterminismGrade.BestEffort,
      },
      issuedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    await this.store.attestations.create(attestation);
    run.attestationId = attestation.id;
    await this.store.runs.update(run.id, run);
    await this.publisher.publishEvent({
      id: `evt_${uuid()}`,
      type: 'attestation.issued',
      schemaVersion: '1.0.0',
      timestamp: new Date().toISOString(),
      ...scope,
      runId: run.id,
      attestationId: attestation.id,
      payload: { attestationId: attestation.id },
    });
  }
}

/** Executor-specific error wrapper. */
export class ExecutorError extends Error {
  constructor(public typedError: TypedError) {
    super(typedError.message);
    this.name = 'ExecutorError';
  }
}

function computeHash(data: string): HashRecord {
  const digest = createHash('sha256').update(data).digest('hex');
  return { algorithm: 'sha256', digest };
}
