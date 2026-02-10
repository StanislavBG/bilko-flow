import { WorkflowExecutor, ExecutorError } from '../../src/engine/executor';
import { DataPlanePublisher } from '../../src/data-plane/publisher';
import { createMemoryStore } from '../../src/storage/memory-store';
import { DeterminismGrade } from '../../src/domain/determinism';
import { RunStatus, StepRunStatus } from '../../src/domain/run';
import { Workflow, WorkflowStatus } from '../../src/domain/workflow';
import { TenantScope } from '../../src/domain/account';
import { Store } from '../../src/storage/store';

const SCOPE: TenantScope = {
  accountId: 'acct_1',
  projectId: 'proj_1',
  environmentId: 'env_1',
};

function makeWorkflow(id: string = 'wf_test'): Workflow {
  return {
    id,
    accountId: SCOPE.accountId,
    projectId: SCOPE.projectId,
    environmentId: SCOPE.environmentId,
    name: 'Test Workflow',
    version: 1,
    specVersion: '1.0.0',
    status: WorkflowStatus.Active,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    determinism: { targetGrade: DeterminismGrade.BestEffort },
    entryStepId: 'step_1',
    steps: [
      {
        id: 'step_1',
        workflowId: id,
        name: 'Step 1',
        type: 'transform.map',
        dependsOn: [],
        inputs: { data: [1, 2, 3] },
        policy: { timeoutMs: 30000, maxAttempts: 1 },
      },
      {
        id: 'step_2',
        workflowId: id,
        name: 'Step 2',
        type: 'transform.filter',
        dependsOn: ['step_1'],
        inputs: { filter: 'even' },
        policy: { timeoutMs: 30000, maxAttempts: 1 },
      },
    ],
    secrets: [],
  };
}

describe('WorkflowExecutor', () => {
  let store: Store;
  let publisher: DataPlanePublisher;
  let executor: WorkflowExecutor;

  beforeEach(() => {
    store = createMemoryStore();
    publisher = new DataPlanePublisher(store);
    executor = new WorkflowExecutor(store, publisher);
  });

  test('creates a run for a valid workflow', async () => {
    const workflow = makeWorkflow();
    await store.workflows.create(workflow);

    const run = await executor.createRun({
      workflowId: workflow.id,
      ...SCOPE,
    });

    expect(run.id).toBeTruthy();
    expect(run.status).toBe(RunStatus.Created);
    expect(run.workflowId).toBe(workflow.id);
    expect(run.workflowVersion).toBe(1);
    expect(run.stepResults['step_1']).toBeDefined();
    expect(run.stepResults['step_2']).toBeDefined();
  });

  test('executes a run to completion', async () => {
    const workflow = makeWorkflow();
    await store.workflows.create(workflow);

    const run = await executor.createRun({
      workflowId: workflow.id,
      ...SCOPE,
    });

    const completedRun = await executor.executeRun(run.id, SCOPE);

    expect(completedRun.status).toBe(RunStatus.Succeeded);
    expect(completedRun.stepResults['step_1'].status).toBe(StepRunStatus.Succeeded);
    expect(completedRun.stepResults['step_2'].status).toBe(StepRunStatus.Succeeded);
    expect(completedRun.provenanceId).toBeTruthy();
    expect(completedRun.attestationId).toBeTruthy();
  });

  test('throws for non-existent workflow', async () => {
    await expect(
      executor.createRun({
        workflowId: 'nonexistent',
        ...SCOPE,
      }),
    ).rejects.toThrow(ExecutorError);
  });

  test('throws for missing required secrets', async () => {
    const workflow = makeWorkflow();
    workflow.secrets = [{ key: 'API_KEY', required: true }];
    await store.workflows.create(workflow);

    await expect(
      executor.createRun({
        workflowId: workflow.id,
        ...SCOPE,
      }),
    ).rejects.toThrow(ExecutorError);
  });

  test('accepts run with provided secrets', async () => {
    const workflow = makeWorkflow();
    workflow.secrets = [{ key: 'API_KEY', required: true }];
    await store.workflows.create(workflow);

    const run = await executor.createRun({
      workflowId: workflow.id,
      ...SCOPE,
      secretOverrides: { API_KEY: 'test-key' },
    });

    expect(run.id).toBeTruthy();
  });

  test('generates provenance after successful run', async () => {
    const workflow = makeWorkflow();
    await store.workflows.create(workflow);

    const run = await executor.createRun({ workflowId: workflow.id, ...SCOPE });
    const completed = await executor.executeRun(run.id, SCOPE);

    const provenance = await store.provenance.getByRunId(completed.id, SCOPE);
    expect(provenance).toBeDefined();
    expect(provenance!.workflowHash.algorithm).toBe('sha256');
    expect(provenance!.transcript.length).toBeGreaterThan(0);
  });

  test('generates attestation after successful run', async () => {
    const workflow = makeWorkflow();
    await store.workflows.create(workflow);

    const run = await executor.createRun({ workflowId: workflow.id, ...SCOPE });
    const completed = await executor.executeRun(run.id, SCOPE);

    const attestation = await store.attestations.getByRunId(completed.id, SCOPE);
    expect(attestation).toBeDefined();
    expect(attestation!.statement.workflowHash.algorithm).toBe('sha256');
    expect(attestation!.status).toBe('issued');
  });

  test('cancels a created run', async () => {
    const workflow = makeWorkflow();
    await store.workflows.create(workflow);

    const run = await executor.createRun({ workflowId: workflow.id, ...SCOPE });
    const canceled = await executor.cancelRun(run.id, SCOPE, 'user_1', 'testing');

    expect(canceled.status).toBe(RunStatus.Canceled);
    expect(canceled.canceledBy).toBe('user_1');
    expect(canceled.cancelReason).toBe('testing');
  });

  test('publishes events during execution', async () => {
    const workflow = makeWorkflow();
    await store.workflows.create(workflow);

    const run = await executor.createRun({ workflowId: workflow.id, ...SCOPE });
    await executor.executeRun(run.id, SCOPE);

    const events = await publisher.getEventsByRun(run.id, SCOPE);
    expect(events.length).toBeGreaterThan(0);

    const eventTypes = events.map(e => e.type);
    expect(eventTypes).toContain('run.created');
    expect(eventTypes).toContain('run.queued');
    expect(eventTypes).toContain('run.started');
    expect(eventTypes).toContain('run.succeeded');
  });

  test('test workflow returns validation and compilation result', async () => {
    const workflow = makeWorkflow();
    const result = await executor.testWorkflow(workflow, SCOPE);
    expect(result.valid).toBe(true);
    expect(result.compilation.success).toBe(true);
    expect(result.determinism).toBeDefined();
  });
});
