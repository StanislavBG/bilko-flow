/**
 * Run-time Data Plane Publisher.
 *
 * Emits stable, versioned execution events and maintains queryable
 * run history as the execution system-of-record.
 */

import { v4 as uuid } from 'uuid';
import { Run } from '../domain/run';
import { DataPlaneEvent, DataPlaneEventType, EventSubscription } from '../domain/events';
import { Store } from '../storage/store';

/** The data plane publisher. */
export class DataPlanePublisher {
  private subscriptions: EventSubscription[] = [];

  constructor(private store: Store) {}

  /** Publish a run lifecycle event. */
  async publishRunEvent(run: Run, eventType: DataPlaneEventType): Promise<DataPlaneEvent> {
    const event: DataPlaneEvent = {
      id: `evt_${uuid()}`,
      type: eventType,
      schemaVersion: '1.0.0',
      timestamp: new Date().toISOString(),
      accountId: run.accountId,
      projectId: run.projectId,
      environmentId: run.environmentId,
      runId: run.id,
      workflowId: run.workflowId,
      payload: {
        status: run.status,
        workflowVersion: run.workflowVersion,
        determinismGrade: run.determinismGrade,
        error: run.error,
      },
    };

    return this.publishEvent(event);
  }

  /** Publish a step lifecycle event. */
  async publishStepEvent(
    run: Run,
    stepId: string,
    eventType: DataPlaneEventType,
  ): Promise<DataPlaneEvent> {
    const stepResult = run.stepResults[stepId];

    const event: DataPlaneEvent = {
      id: `evt_${uuid()}`,
      type: eventType,
      schemaVersion: '1.0.0',
      timestamp: new Date().toISOString(),
      accountId: run.accountId,
      projectId: run.projectId,
      environmentId: run.environmentId,
      runId: run.id,
      stepId,
      workflowId: run.workflowId,
      payload: {
        stepStatus: stepResult?.status,
        attempts: stepResult?.attempts,
        durationMs: stepResult?.durationMs,
        error: stepResult?.error,
      },
    };

    return this.publishEvent(event);
  }

  /** Publish an arbitrary event. */
  async publishEvent(event: DataPlaneEvent): Promise<DataPlaneEvent> {
    // Persist event
    await this.store.events.create(event);

    // Deliver to subscribers
    for (const sub of this.subscriptions) {
      if (this.matchesSubscription(event, sub)) {
        try {
          sub.callback(event);
        } catch {
          // Subscription callbacks should not throw, but we swallow errors
          // to avoid impacting event publication.
        }
      }
    }

    return event;
  }

  /** Subscribe to events. */
  subscribe(subscription: EventSubscription): () => void {
    this.subscriptions.push(subscription);
    return () => {
      this.subscriptions = this.subscriptions.filter((s) => s.id !== subscription.id);
    };
  }

  /** Query events by run. Scope is optional (library mode skips tenant filtering). */
  async getEventsByRun(
    runId: string,
    scope?: { accountId: string; projectId: string; environmentId: string },
  ): Promise<DataPlaneEvent[]> {
    return this.store.events.listByRun(runId, scope);
  }

  /** Query events by scope. */
  async getEventsByScope(
    scope: { accountId: string; projectId: string; environmentId: string },
    eventTypes?: DataPlaneEventType[],
  ): Promise<DataPlaneEvent[]> {
    return this.store.events.listByScope(scope, { eventTypes });
  }

  private matchesSubscription(event: DataPlaneEvent, sub: EventSubscription): boolean {
    // In library mode (no tenant fields), deliver to all subscribers
    if (!event.accountId && !event.projectId) return true;
    if (event.accountId !== sub.accountId) return false;
    if (event.projectId !== sub.projectId) return false;
    if (sub.environmentId && event.environmentId !== sub.environmentId) return false;
    if (sub.eventTypes?.length && !sub.eventTypes.includes(event.type)) return false;
    return true;
  }
}
