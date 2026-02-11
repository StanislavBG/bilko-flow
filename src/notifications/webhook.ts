/**
 * Webhook Notification Service.
 *
 * Delivers run-time events to configured webhook endpoints via HTTP POST.
 * Includes HMAC signature for payload verification when a signing secret is configured.
 */

import { v4 as uuid } from 'uuid';
import { createHmac } from 'crypto';
import { Run } from '../domain/run';
import { Workflow, WebhookEventType } from '../domain/workflow';
import { TypedError } from '../domain/errors';
import { DeterminismGrade } from '../domain/determinism';
import { logger } from '../logger';

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
  signingSecret?: string,
) => Promise<{ statusCode: number }>;

/** HTTP webhook delivery using native fetch with HMAC signing. */
const httpDelivery: WebhookDeliveryFn = async (
  url: string,
  payload: WebhookPayload,
  signingSecret?: string,
) => {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'bilko-flow-webhook/0.2.0',
    'X-Webhook-Id': payload.id,
    'X-Webhook-Event': payload.event,
  };

  if (signingSecret) {
    const signature = createHmac('sha256', signingSecret).update(body).digest('hex');
    headers['X-Webhook-Signature'] = `sha256=${signature}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    return { statusCode: response.status };
  } finally {
    clearTimeout(timeout);
  }
};

/** The webhook notification service. */
export class WebhookService {
  private deliveryFn: WebhookDeliveryFn;
  /** Record of delivered webhooks for testing/audit. */
  private deliveryLog: WebhookDeliveryResult[] = [];

  constructor(deliveryFn?: WebhookDeliveryFn) {
    this.deliveryFn = deliveryFn ?? httpDelivery;
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
      const response = await this.deliveryFn(
        workflow.notification.webhookUrl,
        payload,
        workflow.notification.signingSecretKey,
      );
      const result: WebhookDeliveryResult = {
        success: response.statusCode >= 200 && response.statusCode < 300,
        statusCode: response.statusCode,
        payload,
      };
      this.deliveryLog.push(result);
      if (!result.success) {
        logger.warn('Webhook delivery returned non-2xx', {
          url: workflow.notification.webhookUrl,
          statusCode: response.statusCode,
          event,
          runId: run.id,
        });
      }
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Webhook delivery failed';
      logger.error('Webhook delivery failed', {
        url: workflow.notification.webhookUrl,
        event,
        runId: run.id,
        error: errorMessage,
      });
      const result: WebhookDeliveryResult = {
        success: false,
        error: errorMessage,
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
