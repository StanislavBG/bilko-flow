/**
 * Webhook Notification Service.
 *
 * Delivers run-time events to configured webhook endpoints.
 * Webhooks are one delivery method alongside the broader
 * run-time data plane.
 */

import { v4 as uuid } from 'uuid';
import { Run } from '../domain/run';
import { Workflow, WebhookEventType } from '../domain/workflow';
import { TypedError } from '../domain/errors';
import { DeterminismGrade } from '../domain/determinism';

/** Webhook payload for run events. */
export interface WebhookPayload {
  id: string;
  event: WebhookEventType;
  timestamp: string;
  accountId: string;
  projectId: string;
  environmentId: string;
  runId: string;
  workflowId: string;
  workflowVersion: number;
  status: string;
  determinismGrade?: DeterminismGrade;
  error?: TypedError;
  artifactIds?: string[];
  attestationId?: string;
  provenanceId?: string;
}

/** Webhook delivery result. */
export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  payload: WebhookPayload;
}

/** Webhook delivery function type (injectable for testing). */
export type WebhookDeliveryFn = (
  url: string,
  payload: WebhookPayload,
) => Promise<{ statusCode: number }>;

/** Default HTTP webhook delivery. */
const defaultDelivery: WebhookDeliveryFn = async (url: string, payload: WebhookPayload) => {
  // In a production implementation, this would make an actual HTTP request.
  // For the reference implementation, we simulate successful delivery.
  return { statusCode: 200 };
};

/** The webhook notification service. */
export class WebhookService {
  private deliveryFn: WebhookDeliveryFn;
  /** Record of delivered webhooks for testing/audit. */
  private deliveryLog: WebhookDeliveryResult[] = [];

  constructor(deliveryFn?: WebhookDeliveryFn) {
    this.deliveryFn = deliveryFn ?? defaultDelivery;
  }

  /** Send a webhook notification for a run event. */
  async notify(
    event: WebhookEventType,
    run: Run,
    workflow: Workflow,
    extra?: { artifactIds?: string[]; attestationId?: string; provenanceId?: string },
  ): Promise<WebhookDeliveryResult> {
    if (!workflow.notification?.webhookUrl) {
      return {
        success: false,
        error: 'No webhook URL configured',
        payload: this.buildPayload(event, run, workflow, extra),
      };
    }

    // Check if this event type is in the subscription list
    if (!workflow.notification.events.includes(event)) {
      return {
        success: true,
        payload: this.buildPayload(event, run, workflow, extra),
      };
    }

    const payload = this.buildPayload(event, run, workflow, extra);

    try {
      const response = await this.deliveryFn(workflow.notification.webhookUrl, payload);
      const result: WebhookDeliveryResult = {
        success: response.statusCode >= 200 && response.statusCode < 300,
        statusCode: response.statusCode,
        payload,
      };
      this.deliveryLog.push(result);
      return result;
    } catch (err) {
      const result: WebhookDeliveryResult = {
        success: false,
        error: err instanceof Error ? err.message : 'Webhook delivery failed',
        payload,
      };
      this.deliveryLog.push(result);
      return result;
    }
  }

  /** Get delivery log (for testing/audit). */
  getDeliveryLog(): WebhookDeliveryResult[] {
    return [...this.deliveryLog];
  }

  private buildPayload(
    event: WebhookEventType,
    run: Run,
    workflow: Workflow,
    extra?: { artifactIds?: string[]; attestationId?: string; provenanceId?: string },
  ): WebhookPayload {
    return {
      id: `whk_${uuid()}`,
      event,
      timestamp: new Date().toISOString(),
      accountId: run.accountId,
      projectId: run.projectId,
      environmentId: run.environmentId,
      runId: run.id,
      workflowId: run.workflowId,
      workflowVersion: run.workflowVersion,
      status: run.status,
      determinismGrade: run.determinismGrade,
      error: run.error,
      artifactIds: extra?.artifactIds,
      attestationId: extra?.attestationId,
      provenanceId: extra?.provenanceId,
    };
  }
}
