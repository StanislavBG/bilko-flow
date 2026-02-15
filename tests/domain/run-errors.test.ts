/**
 * Tests for RUN error factory functions (v0.3.0 error taxonomy).
 *
 * Verifies that all RUN-prefixed error factories produce correctly
 * structured TypedError objects with proper codes, retryability flags,
 * messages, and details.
 */

import {
  runNotFoundError,
  runCanceledError,
  runTimeoutError,
  runInvalidStateTransition,
} from '../../src/domain/errors';

describe('runNotFoundError', () => {
  it('produces a RUN.NOT_FOUND error with the run ID in the message', () => {
    const error = runNotFoundError('run_abc123');
    expect(error.code).toBe('RUN.NOT_FOUND');
    expect(error.message).toContain('run_abc123');
    expect(error.retryable).toBe(false);
  });
});

describe('runCanceledError', () => {
  it('produces a RUN.CANCELED error without reason', () => {
    const error = runCanceledError('run_1');
    expect(error.code).toBe('RUN.CANCELED');
    expect(error.message).toBe('Run canceled');
    expect(error.retryable).toBe(false);
  });

  it('produces a RUN.CANCELED error with reason', () => {
    const error = runCanceledError('run_1', 'User requested');
    expect(error.code).toBe('RUN.CANCELED');
    expect(error.message).toContain('User requested');
    expect(error.retryable).toBe(false);
    expect(error.details).toEqual({ reason: 'User requested' });
  });

  it('omits details when no reason is provided', () => {
    const error = runCanceledError('run_1');
    expect(error.details).toBeUndefined();
  });
});

describe('runTimeoutError', () => {
  it('produces a retryable RUN.TIMEOUT error', () => {
    const error = runTimeoutError('run_1', 30000);
    expect(error.code).toBe('RUN.TIMEOUT');
    expect(error.message).toContain('30000');
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({ timeoutMs: 30000 });
  });

  it('suggests doubling the timeout', () => {
    const error = runTimeoutError('run_1', 5000);
    expect(error.suggestedFixes.length).toBeGreaterThan(0);
    expect(error.suggestedFixes[0].type).toBe('INCREASE_TIMEOUT');
    expect(error.suggestedFixes[0].params).toEqual({ timeoutMs: 10000 });
  });
});

describe('runInvalidStateTransition', () => {
  it('produces a RUN.INVALID_STATE_TRANSITION error with from/to details', () => {
    const error = runInvalidStateTransition('run_1', 'succeeded', 'running');
    expect(error.code).toBe('RUN.INVALID_STATE_TRANSITION');
    expect(error.message).toContain('succeeded');
    expect(error.message).toContain('running');
    expect(error.retryable).toBe(false);
    expect(error.details).toEqual({ from: 'succeeded', to: 'running' });
  });
});
