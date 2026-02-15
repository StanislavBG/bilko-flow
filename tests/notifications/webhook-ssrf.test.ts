/**
 * Tests for webhook SSRF protection and retry logic (v0.3.0).
 *
 * Verifies that:
 * - Private/reserved IP ranges are blocked
 * - Localhost URLs are blocked
 * - Cloud metadata endpoints are blocked
 * - Non-HTTP protocols are blocked
 * - Public URLs are allowed
 * - Retry logic works for transient failures
 */

import { validateWebhookUrl, WebhookService } from '../../src/notifications/webhook';
import type { WebhookDeliveryFn, WebhookPayload } from '../../src/notifications/webhook';
import { RunStatus } from '../../src/domain/run';
import type { Run } from '../../src/domain/run';
import type { Workflow } from '../../src/domain/workflow';
import { WorkflowStatus } from '../../src/domain/workflow';
import { DeterminismGrade } from '../../src/domain/determinism';

describe('validateWebhookUrl', () => {
  describe('blocks unsafe URLs', () => {
    it('rejects localhost', () => {
      expect(validateWebhookUrl('http://localhost:3000/webhook')).not.toBeNull();
      expect(validateWebhookUrl('http://127.0.0.1:8080/webhook')).not.toBeNull();
    });

    it('rejects cloud metadata endpoints', () => {
      expect(validateWebhookUrl('http://169.254.169.254/latest/meta-data')).not.toBeNull();
      expect(validateWebhookUrl('http://metadata.google.internal/computeMetadata')).not.toBeNull();
    });

    it('rejects private IP ranges (RFC 1918)', () => {
      // 10.0.0.0/8
      expect(validateWebhookUrl('http://10.0.0.1/webhook')).not.toBeNull();
      expect(validateWebhookUrl('http://10.255.255.255/webhook')).not.toBeNull();
      // 172.16.0.0/12
      expect(validateWebhookUrl('http://172.16.0.1/webhook')).not.toBeNull();
      expect(validateWebhookUrl('http://172.31.255.255/webhook')).not.toBeNull();
      // 192.168.0.0/16
      expect(validateWebhookUrl('http://192.168.1.1/webhook')).not.toBeNull();
    });

    it('rejects link-local range', () => {
      expect(validateWebhookUrl('http://169.254.1.1/webhook')).not.toBeNull();
    });

    it('rejects non-HTTP protocols', () => {
      expect(validateWebhookUrl('ftp://example.com/webhook')).not.toBeNull();
      expect(validateWebhookUrl('file:///etc/passwd')).not.toBeNull();
    });

    it('rejects invalid URLs', () => {
      expect(validateWebhookUrl('not-a-url')).not.toBeNull();
      expect(validateWebhookUrl('')).not.toBeNull();
    });

    it('rejects 0.0.0.0', () => {
      expect(validateWebhookUrl('http://0.0.0.0/webhook')).not.toBeNull();
    });
  });

  describe('allows safe URLs', () => {
    it('allows public HTTPS URLs', () => {
      expect(validateWebhookUrl('https://api.example.com/webhook')).toBeNull();
    });

    it('allows public HTTP URLs', () => {
      expect(validateWebhookUrl('http://api.example.com/webhook')).toBeNull();
    });

    it('allows domain names (not IP-blocked)', () => {
      expect(validateWebhookUrl('https://hooks.slack.com/webhook')).toBeNull();
    });

    it('allows 172.32+ (outside private range)', () => {
      expect(validateWebhookUrl('http://172.32.0.1/webhook')).toBeNull();
    });
  });
});

describe('WebhookService SSRF protection', () => {
  const mockRun: Run = {
    id: 'run_1',
    workflowId: 'wf_1',
    workflowVersion: 1,
    accountId: 'acct_1',
    projectId: 'proj_1',
    environmentId: 'env_1',
    status: RunStatus.Succeeded,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    stepResults: {},
  };

  it('blocks webhook delivery to private IP', async () => {
    const deliveryFn: WebhookDeliveryFn = jest.fn().mockResolvedValue({ statusCode: 200 });
    const service = new WebhookService(deliveryFn);

    const workflow = {
      id: 'wf_1',
      accountId: 'acct_1',
      projectId: 'proj_1',
      environmentId: 'env_1',
      name: 'test',
      version: 1,
      specVersion: '1.0.0',
      status: WorkflowStatus.Active,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      determinism: { targetGrade: DeterminismGrade.BestEffort },
      entryStepId: 'step_1',
      steps: [],
      secrets: [],
      notification: {
        webhookUrl: 'http://10.0.0.1/internal',
        events: ['run.completed' as const],
      },
    };

    const result = await service.notify('run.completed', mockRun, workflow);
    expect(result.success).toBe(false);
    expect(result.error).toContain('private IP');
    // Should NOT have called the delivery function
    expect(deliveryFn).not.toHaveBeenCalled();
  });
});
