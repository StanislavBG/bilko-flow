/**
 * Tests for safe publisher wrappers in the executor (v0.3.0 resilience).
 *
 * Verifies that publisher errors do NOT crash run execution. The
 * executor wraps all publisher calls in try-catch to ensure event
 * publishing failures are swallowed.
 */

import { createMemoryStore } from '../../src/storage/memory-store';
import { DataPlanePublisher } from '../../src/data-plane/publisher';
import { WorkflowExecutor } from '../../src/engine/executor';
import { registerStepHandler, clearStepHandlers } from '../../src/engine/step-runner';
import { WorkflowStatus } from '../../src/domain/workflow';
import type { Workflow } from '../../src/domain/workflow';
import { RunStatus } from '../../src/domain/run';
import { DeterminismGrade } from '../../src/domain/determinism';

const SCOPE = {
  accountId: 'acct_1',
  projectId: 'proj_1',
  environmentId: 'env_1',
};

describe('Executor safe publisher wrappers', () => {
  afterEach(() => {
    clearStepHandlers();
  });

  it('run succeeds even when publisher.publishRunEvent throws', async () => {
    const store = createMemoryStore();

    // Create a publisher that always throws
    const brokenPublisher = new DataPlanePublisher(store);
    const originalPublishRunEvent = brokenPublisher.publishRunEvent.bind(brokenPublisher);
    brokenPublisher.publishRunEvent = async () => {
      throw new Error('Publisher is broken');
    };

    const executor = new WorkflowExecutor(store, brokenPublisher);

    registerStepHandler({
      type: 'transform.map' as const,
      execute: async () => ({ outputs: { value: 'hello' } }),
    });

    const workflow = {
      id: 'wf_1',
      ...SCOPE,
      name: 'Test',
      version: 1,
      specVersion: '1.0.0',
      status: WorkflowStatus.Active,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      determinism: { targetGrade: DeterminismGrade.BestEffort },
      entryStepId: 's1',
      steps: [{
        id: 's1',
        workflowId: 'wf_1',
        name: 'Echo',
        type: 'transform.map' as const,
        dependsOn: [],
        inputs: {},
        policy: { timeoutMs: 5000, maxAttempts: 1 },
      }],
      secrets: [],
    };
    await store.workflows.create(workflow);

    const run = await executor.createRun({
      workflowId: 'wf_1',
      workflowVersion: 1,
      ...SCOPE,
    });

    // This should NOT throw even though publisher is broken
    const result = await executor.executeRun(run.id, SCOPE);
    expect(result.status).toBe(RunStatus.Succeeded);
  });

  it('run succeeds even when publisher.publishStepEvent throws', async () => {
    const store = createMemoryStore();

    const brokenPublisher = new DataPlanePublisher(store);
    brokenPublisher.publishStepEvent = async () => {
      throw new Error('Step publisher is broken');
    };

    const executor = new WorkflowExecutor(store, brokenPublisher);

    registerStepHandler({
      type: 'transform.map' as const,
      execute: async () => ({ outputs: {} }),
    });

    const workflow = {
      id: 'wf_2',
      ...SCOPE,
      name: 'Test',
      version: 1,
      specVersion: '1.0.0',
      status: WorkflowStatus.Active,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      determinism: { targetGrade: DeterminismGrade.BestEffort },
      entryStepId: 's1',
      steps: [{
        id: 's1',
        workflowId: 'wf_2',
        name: 'OK',
        type: 'transform.map' as const,
        dependsOn: [],
        inputs: {},
        policy: { timeoutMs: 5000, maxAttempts: 1 },
      }],
      secrets: [],
    };
    await store.workflows.create(workflow);

    const run = await executor.createRun({
      workflowId: 'wf_2',
      workflowVersion: 1,
      ...SCOPE,
    });

    const result = await executor.executeRun(run.id, SCOPE);
    expect(result.status).toBe(RunStatus.Succeeded);
  });
});
