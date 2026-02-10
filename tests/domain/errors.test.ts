import {
  createTypedError,
  validationError,
  authError,
  notFoundError,
  stepTimeoutError,
  secretMissingError,
  rateLimitError,
  determinismViolationError,
  apiError,
} from '../../src/domain/errors';

describe('Typed Error Model', () => {
  test('createTypedError produces complete error object', () => {
    const error = createTypedError({
      code: 'TEST.ERROR',
      message: 'test error',
      retryable: true,
      details: { key: 'value' },
      suggestedFixes: [{ type: 'FIX', params: {} }],
    });

    expect(error.code).toBe('TEST.ERROR');
    expect(error.message).toBe('test error');
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({ key: 'value' });
    expect(error.suggestedFixes).toHaveLength(1);
  });

  test('defaults retryable to false', () => {
    const error = createTypedError({ code: 'TEST', message: 'test' });
    expect(error.retryable).toBe(false);
    expect(error.suggestedFixes).toEqual([]);
  });

  test('validationError factory', () => {
    const error = validationError('bad input');
    expect(error.code).toBe('VALIDATION.SCHEMA');
    expect(error.retryable).toBe(false);
  });

  test('authError factory', () => {
    const error = authError('forbidden');
    expect(error.code).toBe('AUTH.FORBIDDEN');
    expect(error.retryable).toBe(false);
  });

  test('notFoundError factory', () => {
    const error = notFoundError('Workflow', 'wf_123');
    expect(error.code).toBe('VALIDATION.NOT_FOUND');
    expect(error.message).toContain('wf_123');
  });

  test('stepTimeoutError includes suggested fixes', () => {
    const error = stepTimeoutError('step_1', 30000, 2);
    expect(error.code).toBe('STEP.HTTP.TIMEOUT');
    expect(error.retryable).toBe(true);
    expect(error.suggestedFixes.length).toBeGreaterThan(0);
    expect(error.suggestedFixes.some(f => f.type === 'INCREASE_TIMEOUT')).toBe(true);
  });

  test('secretMissingError includes fix suggestion', () => {
    const error = secretMissingError('API_KEY');
    expect(error.code).toBe('SECRETS.MISSING');
    expect(error.suggestedFixes[0].type).toBe('PROVIDE_SECRET');
  });

  test('rateLimitError is retryable', () => {
    const error = rateLimitError(5000);
    expect(error.code).toBe('RATE_LIMIT.EXCEEDED');
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({ retryAfterMs: 5000 });
  });

  test('determinismViolationError', () => {
    const error = determinismViolationError('violation', 'step_1');
    expect(error.code).toBe('WORKFLOW.DETERMINISM_VIOLATION');
    expect(error.stepId).toBe('step_1');
  });

  test('apiError wraps error in response format', () => {
    const error = createTypedError({ code: 'TEST', message: 'test' });
    const response = apiError(error);
    expect(response.error).toBe(error);
  });
});
