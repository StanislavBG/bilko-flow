/**
 * Tests for the DataPlanePublisher (v0.3.0 resilience audit).
 *
 * Verifies that:
 * - Events are persisted and delivered to subscribers
 * - Subscriber callback errors don't crash event publishing
 * - Subscription filtering works correctly
 * - Unsubscribe removes the subscription
 */

import { createMemoryStore } from '../../src/storage/memory-store';
import { DataPlanePublisher } from '../../src/data-plane/publisher';
import { RunStatus } from '../../src/domain/run';
import type { Run } from '../../src/domain/run';
import type { DataPlaneEvent } from '../../src/domain/events';

const SCOPE = {
  accountId: 'acct_1',
  projectId: 'proj_1',
  environmentId: 'env_1',
};

function createMockRun(overrides?: Partial<Run>): Run {
  return {
    id: 'run_1',
    workflowId: 'wf_1',
    workflowVersion: 1,
    ...SCOPE,
    status: RunStatus.Running,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    stepResults: {},
    ...overrides,
  };
}

describe('DataPlanePublisher', () => {
  it('persists events to the store', async () => {
    const store = createMemoryStore();
    const publisher = new DataPlanePublisher(store);

    const run = createMockRun();
    const event = await publisher.publishRunEvent(run, 'run.started');

    expect(event.type).toBe('run.started');
    expect(event.runId).toBe('run_1');

    const storedEvents = await store.events.listByRun('run_1', SCOPE);
    expect(storedEvents.length).toBe(1);
    expect(storedEvents[0].type).toBe('run.started');
  });

  it('delivers events to matching subscribers', async () => {
    const store = createMemoryStore();
    const publisher = new DataPlanePublisher(store);
    const received: DataPlaneEvent[] = [];

    publisher.subscribe({
      id: 'sub_1',
      accountId: 'acct_1',
      projectId: 'proj_1',
      callback: (event) => received.push(event),
    });

    const run = createMockRun();
    await publisher.publishRunEvent(run, 'run.started');

    expect(received.length).toBe(1);
    expect(received[0].type).toBe('run.started');
  });

  it('does not deliver events to non-matching subscribers', async () => {
    const store = createMemoryStore();
    const publisher = new DataPlanePublisher(store);
    const received: DataPlaneEvent[] = [];

    publisher.subscribe({
      id: 'sub_1',
      accountId: 'acct_OTHER',
      projectId: 'proj_1',
      callback: (event) => received.push(event),
    });

    const run = createMockRun();
    await publisher.publishRunEvent(run, 'run.started');

    expect(received.length).toBe(0);
  });

  it('swallows subscriber callback errors without affecting other subscribers', async () => {
    const store = createMemoryStore();
    const publisher = new DataPlanePublisher(store);
    const received: DataPlaneEvent[] = [];

    // First subscriber throws
    publisher.subscribe({
      id: 'sub_broken',
      accountId: 'acct_1',
      projectId: 'proj_1',
      callback: () => { throw new Error('Subscriber crashed'); },
    });

    // Second subscriber should still receive the event
    publisher.subscribe({
      id: 'sub_ok',
      accountId: 'acct_1',
      projectId: 'proj_1',
      callback: (event) => received.push(event),
    });

    const run = createMockRun();
    // Should not throw
    await publisher.publishRunEvent(run, 'run.started');

    // Second subscriber should have received the event
    expect(received.length).toBe(1);
  });

  it('unsubscribe removes the subscription', async () => {
    const store = createMemoryStore();
    const publisher = new DataPlanePublisher(store);
    const received: DataPlaneEvent[] = [];

    const unsub = publisher.subscribe({
      id: 'sub_1',
      accountId: 'acct_1',
      projectId: 'proj_1',
      callback: (event) => received.push(event),
    });

    const run = createMockRun();
    await publisher.publishRunEvent(run, 'run.started');
    expect(received.length).toBe(1);

    unsub();

    await publisher.publishRunEvent(run, 'run.succeeded');
    // Should still be 1 — unsubscribed before second event
    expect(received.length).toBe(1);
  });

  it('publishes step events with step-specific payload', async () => {
    const store = createMemoryStore();
    const publisher = new DataPlanePublisher(store);

    const run = createMockRun({
      stepResults: {
        step_1: { stepId: 'step_1', status: 'running' as any, attempts: 1 },
      },
    });

    const event = await publisher.publishStepEvent(run, 'step_1', 'step.started');
    expect(event.type).toBe('step.started');
    expect(event.stepId).toBe('step_1');
    expect(event.payload.stepStatus).toBe('running');
    expect(event.payload.attempts).toBe(1);
  });

  it('filters by event types when subscribed with eventTypes', async () => {
    const store = createMemoryStore();
    const publisher = new DataPlanePublisher(store);
    const received: DataPlaneEvent[] = [];

    publisher.subscribe({
      id: 'sub_1',
      accountId: 'acct_1',
      projectId: 'proj_1',
      eventTypes: ['run.succeeded'],
      callback: (event) => received.push(event),
    });

    const run = createMockRun();
    await publisher.publishRunEvent(run, 'run.started');
    await publisher.publishRunEvent(run, 'run.succeeded');

    // Should only receive the succeeded event
    expect(received.length).toBe(1);
    expect(received[0].type).toBe('run.succeeded');
  });
});
