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

/** Webhook payload for run events. */
export interface WebhookPayload {
  id: string;
  event: WebhookEventType;
  timestamp: string;
  accountId?: string;
  projectId?: string;
  environmentId?: string;
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SSRF PROTECTION (v0.3.0 — RESILIENCY ENHANCEMENT)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The architectural audit identified that webhook URLs were not validated
 * before delivery. A malicious consumer could configure a webhook URL
 * pointing to internal services (e.g., http://169.254.169.254/ for cloud
 * metadata, http://localhost:3000/ for internal APIs), turning the webhook
 * service into a Server-Side Request Forgery (SSRF) proxy.
 *
 * `validateWebhookUrl()` blocks:
 * - Non-HTTP(S) protocols (file://, ftp://, etc.)
 * - Private/reserved IP ranges (RFC 1918, link-local, loopback)
 * - Cloud metadata endpoints (169.254.169.254)
 * - Localhost references
 *
 * Consumers deploying bilko-flow in production MUST configure webhook URLs
 * pointing to public, internet-routable endpoints only.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Validate that a webhook URL is safe to send HTTP requests to.
 * Returns an error message if the URL is unsafe, or null if safe.
 */
export function validateWebhookUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `Invalid webhook URL: ${url}`;
  }

  // Only allow HTTP(S) protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Webhook URL must use http or https protocol, got: ${parsed.protocol}`;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
    return `Webhook URL must not point to localhost: ${hostname}`;
  }

  // Block cloud metadata endpoints
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    return `Webhook URL must not point to cloud metadata endpoints: ${hostname}`;
  }

  // Block private/reserved IP ranges (basic check for common patterns)
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 10.0.0.0/8
    if (a === 10) return `Webhook URL must not point to private IP range: ${hostname}`;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return `Webhook URL must not point to private IP range: ${hostname}`;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return `Webhook URL must not point to private IP range: ${hostname}`;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return `Webhook URL must not point to link-local range: ${hostname}`;
    // 0.0.0.0
    if (a === 0) return `Webhook URL must not point to unspecified address: ${hostname}`;
  }

  return null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RETRY LOGIC (v0.3.0 — RESILIENCY ENHANCEMENT)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The architectural audit identified that webhook delivery had no retry
 * mechanism. A single transient network failure or 5xx response would
 * permanently lose the webhook notification.
 *
 * The delivery function now retries up to 3 times with exponential backoff
 * (1s, 2s, 4s) on retryable failures (network errors and 5xx responses).
 * Non-retryable responses (4xx) fail immediately.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const WEBHOOK_MAX_RETRIES = 3;
const WEBHOOK_BACKOFF_BASE_MS = 1000;

function webhookSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** HTTP webhook delivery using native fetch with HMAC signing and retry. */
const httpDelivery: WebhookDeliveryFn = async (
  url: string,
  payload: WebhookPayload,
  signingSecret?: string,
) => {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'bilko-flow-webhook/0.3.0',
    'X-Webhook-Id': payload.id,
    'X-Webhook-Event': payload.event,
  };

  if (signingSecret) {
    const signature = createHmac('sha256', signingSecret).update(body).digest('hex');
    headers['X-Webhook-Signature'] = `sha256=${signature}`;
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= WEBHOOK_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await webhookSleep(WEBHOOK_BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
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
      clearTimeout(timeout);

      // Non-retryable client errors — fail immediately
      if (response.status >= 400 && response.status < 500) {
        return { statusCode: response.status };
      }

      // Success — return
      if (response.status < 500) {
        return { statusCode: response.status };
      }

      // 5xx — retry
      lastError = new Error(`Webhook returned HTTP ${response.status}`);
    } catch (err) {
      clearTimeout(timeout);
      lastError = err instanceof Error ? err : new Error('Unknown webhook error');
    }
  }

  throw lastError ?? new Error('Webhook delivery failed after retries');
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

    // SSRF protection: validate URL before making any request
    const urlError = validateWebhookUrl(workflow.notification.webhookUrl);
    if (urlError) {
      const payload = this.buildPayload(event, run, workflow, extra);
      const result: WebhookDeliveryResult = { success: false, error: urlError, payload };
      this.deliveryLog.push(result);
      return result;
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
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Webhook delivery failed';
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
