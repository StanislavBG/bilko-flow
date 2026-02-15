/**
 * Tests for unscoped (library-only) workflow execution.
 *
 * Verifies that bilko-flow works as a standalone library without
 * any tenant scoping (no accountId/projectId/environmentId).
 * This is the primary mode for agents and tools consuming the library.
 */

import { createMemoryStore } from '../../src/storage/memory-store';
import { DataPlanePublisher } from '../../src/data-plane/publisher';
import { WorkflowExecutor } from '../../src/engine/executor';
import { registerStepHandler, clearStepHandlers } from '../../src/engine/step-runner';
import { WorkflowStatus } from '../../src/domain/workflow';
import { RunStatus } from '../../src/domain/run';
import { DeterminismGrade } from '../../src/domain/determinism';
import type { Workflow } from '../../src/domain/workflow';

describe('Unscoped (library-only) execution', () => {
  afterEach(() => {
    clearStepHandlers();
  });

  function makeWorkflow(id: string): Workflow {
    return {
      id,
      // NOTE: No accountId, projectId, environmentId
      name: 'Library Workflow',
      version: 1,
      specVersion: '1.0.0',
      status: WorkflowStatus.Active,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      determinism: { targetGrade: DeterminismGrade.BestEffort },
      entryStepId: 's1',
      steps: [{
        id: 's1',
        workflowId: id,
        name: 'Echo',
        type: 'transform.map' as const,
        dependsOn: [],
        inputs: { value: 'hello' },
        policy: { timeoutMs: 5000, maxAttempts: 1 },
      }],
      secrets: [],
    };
  }

  it('creates and executes a run without any tenant scope', async () => {
    const store = createMemoryStore();
    const publisher = new DataPlanePublisher(store);
    const executor = new WorkflowExecutor(store, publisher);

    registerStepHandler({
      type: 'transform.map',
      execute: async () => ({ outputs: { result: 42 } }),
    });

    const workflow = makeWorkflow('wf_lib_1');
    await store.workflows.create(workflow);

    // Create run WITHOUT scope
    const run = await executor.createRun({
      workflowId: 'wf_lib_1',
      // No accountId, projectId, environmentId
    });

    expect(run.accountId).toBeUndefined();
    expect(run.projectId).toBeUndefined();
    expect(run.environmentId).toBeUndefined();
    expect(run.status).toBe(RunStatus.Created);

    // Execute WITHOUT scope
    const result = await executor.executeRun(run.id);
    expect(result.status).toBe(RunStatus.Succeeded);
    expect(result.stepResults['s1'].outputs).toEqual({ result: 42 });
  });

  it('store lookups work without scope (no tenant filtering)', async () => {
    const store = createMemoryStore();

    const workflow = makeWorkflow('wf_lib_2');
    await store.workflows.create(workflow);

    // Lookup by ID without scope
    const found = await store.workflows.getById('wf_lib_2');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Library Workflow');

    // Versioned lookup without scope
    const versioned = await store.workflows.getByIdAndVersion('wf_lib_2', 1);
    expect(versioned).not.toBeNull();
  });

  it('generates provenance and attestation without scope', async () => {
    const store = createMemoryStore();
    const publisher = new DataPlanePublisher(store);
    const executor = new WorkflowExecutor(store, publisher);

    registerStepHandler({
      type: 'transform.map',
      execute: async () => ({ outputs: { data: 'test' } }),
    });

    const workflow = makeWorkflow('wf_lib_3');
    await store.workflows.create(workflow);

    const run = await executor.createRun({ workflowId: 'wf_lib_3' });
    const result = await executor.executeRun(run.id);

    expect(result.status).toBe(RunStatus.Succeeded);
    expect(result.provenanceId).toBeDefined();
    expect(result.attestationId).toBeDefined();

    // Verify provenance was stored and retrievable without scope
    const provenance = await store.provenance.getByRunId(result.id);
    expect(provenance).not.toBeNull();
    expect(provenance!.accountId).toBeUndefined();

    // Verify attestation was stored and retrievable without scope
    const attestation = await store.attestations.getByRunId(result.id);
    expect(attestation).not.toBeNull();
    expect(attestation!.accountId).toBeUndefined();
  });

  it('cancels a run without scope', async () => {
    const store = createMemoryStore();
    const publisher = new DataPlanePublisher(store);
    const executor = new WorkflowExecutor(store, publisher);

    registerStepHandler({
      type: 'transform.map',
      execute: async () => ({ outputs: {} }),
    });

    const workflow = makeWorkflow('wf_lib_4');
    await store.workflows.create(workflow);

    const run = await executor.createRun({ workflowId: 'wf_lib_4' });

    // Cancel without scope
    const canceled = await executor.cancelRun(run.id, undefined, 'test-agent', 'testing');
    expect(canceled.status).toBe(RunStatus.Canceled);
  });

  it('scoped workflows are not visible without matching scope', async () => {
    const store = createMemoryStore();

    const scopedWorkflow: Workflow = {
      ...makeWorkflow('wf_scoped'),
      accountId: 'acct_1',
      projectId: 'proj_1',
      environmentId: 'env_1',
    };
    await store.workflows.create(scopedWorkflow);

    // Lookup with matching scope — should find it
    const found = await store.workflows.getById('wf_scoped', {
      accountId: 'acct_1',
      projectId: 'proj_1',
      environmentId: 'env_1',
    });
    expect(found).not.toBeNull();

    // Lookup with wrong scope — should NOT find it
    const notFound = await store.workflows.getById('wf_scoped', {
      accountId: 'acct_OTHER',
      projectId: 'proj_1',
      environmentId: 'env_1',
    });
    expect(notFound).toBeNull();

    // Lookup without scope — should find it (no filtering)
    const unscopedFound = await store.workflows.getById('wf_scoped');
    expect(unscopedFound).not.toBeNull();
  });
});
