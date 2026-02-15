/**
 * Tests for memory store deep copy isolation (v0.3.0 resiliency enhancement).
 *
 * Verifies that mutations to returned objects do NOT corrupt the store's
 * internal state. This was a vulnerability found during the architectural
 * audit: shallow spread copies shared nested array/object references.
 */

import { createMemoryStore } from '../../src/storage/memory-store';
import type { Workflow } from '../../src/domain/workflow';
import type { Run } from '../../src/domain/run';
import { WorkflowStatus } from '../../src/domain/workflow';
import { RunStatus } from '../../src/domain/run';
import { DeterminismGrade } from '../../src/domain/determinism';

const scope = {
  accountId: 'acct_1',
  projectId: 'proj_1',
  environmentId: 'env_1',
};

describe('MemoryWorkflowStore deep copy isolation', () => {
  const baseWorkflow: Workflow = {
    id: 'wf_1',
    ...scope,
    name: 'Test Workflow',
    version: 1,
    specVersion: '1.0.0',
    status: WorkflowStatus.Active,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    determinism: { targetGrade: DeterminismGrade.BestEffort },
    entryStepId: 'step_1',
    steps: [
      {
        id: 'step_1',
        workflowId: 'wf_1',
        name: 'Step 1',
        type: 'transform.map',
        dependsOn: [],
        inputs: { data: [1, 2, 3] },
        policy: { timeoutMs: 30000, maxAttempts: 1 },
      },
    ],
    secrets: [],
  };

  it('returned workflow is isolated from store (mutating returned object does not affect store)', async () => {
    const store = createMemoryStore();
    await store.workflows.create(baseWorkflow);

    const fetched = await store.workflows.getById('wf_1', scope);
    expect(fetched).not.toBeNull();

    // Mutate the returned workflow's nested steps array
    fetched!.steps[0].name = 'MUTATED';
    (fetched!.steps[0].inputs as any).data.push(99);

    // Fetch again — store should be unaffected
    const fresh = await store.workflows.getById('wf_1', scope);
    expect(fresh!.steps[0].name).toBe('Step 1');
    expect((fresh!.steps[0].inputs as any).data).toEqual([1, 2, 3]);
  });

  it('created workflow is isolated from input object', async () => {
    const store = createMemoryStore();
    const input = { ...baseWorkflow, id: 'wf_2' };
    await store.workflows.create(input);

    // Mutate the input object after create
    input.steps[0].name = 'MUTATED_INPUT';

    const fetched = await store.workflows.getById('wf_2', scope);
    expect(fetched!.steps[0].name).toBe('Step 1');
  });
});

describe('MemoryRunStore deep copy isolation', () => {
  const baseRun: Run = {
    id: 'run_1',
    workflowId: 'wf_1',
    workflowVersion: 1,
    ...scope,
    status: RunStatus.Running,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    stepResults: {
      step_1: {
        stepId: 'step_1',
        status: 'pending' as any,
        attempts: 0,
      },
    },
  };

  it('returned run is isolated from store (mutating stepResults does not affect store)', async () => {
    const store = createMemoryStore();
    await store.runs.create(baseRun);

    const fetched = await store.runs.getById('run_1', scope);
    expect(fetched).not.toBeNull();

    // Mutate the returned run's nested stepResults
    fetched!.stepResults.step_1.status = 'succeeded' as any;

    // Fetch again — store should be unaffected
    const fresh = await store.runs.getById('run_1', scope);
    expect(fresh!.stepResults.step_1.status).toBe('pending');
  });
});

describe('Store delete operations', () => {
  it('deletes a workflow', async () => {
    const store = createMemoryStore();
    const wf: Workflow = {
      ...baseWorkflow(),
      id: 'wf_del',
    };
    await store.workflows.create(wf);
    expect(await store.workflows.getById('wf_del', scope)).not.toBeNull();

    const deleted = await store.workflows.delete('wf_del');
    expect(deleted).toBe(true);
    expect(await store.workflows.getById('wf_del', scope)).toBeNull();
  });

  it('deletes a run', async () => {
    const store = createMemoryStore();
    const run: Run = {
      id: 'run_del',
      workflowId: 'wf_1',
      workflowVersion: 1,
      ...scope,
      status: RunStatus.Created,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      stepResults: {},
    };
    await store.runs.create(run);
    expect(await store.runs.getById('run_del', scope)).not.toBeNull();

    const deleted = await store.runs.delete('run_del');
    expect(deleted).toBe(true);
    expect(await store.runs.getById('run_del', scope)).toBeNull();
  });

  it('returns false when deleting non-existent workflow', async () => {
    const store = createMemoryStore();
    expect(await store.workflows.delete('nope')).toBe(false);
  });

  it('returns false when deleting non-existent run', async () => {
    const store = createMemoryStore();
    expect(await store.runs.delete('nope')).toBe(false);
  });
});

function baseWorkflow(): Workflow {
  return {
    id: 'wf_1',
    ...scope,
    name: 'Test',
    version: 1,
    specVersion: '1.0.0',
    status: WorkflowStatus.Active,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    determinism: { targetGrade: DeterminismGrade.BestEffort },
    entryStepId: 's1',
    steps: [],
    secrets: [],
  };
}
