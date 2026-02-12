import {
  presentError,
  presentErrors,
  maxSeverity,
  DEFAULT_ERROR_PRESENTATION_RULES,
} from '../../src/domain/error-presentation';
import { createTypedError, stepTimeoutError, rateLimitError, secretMissingError } from '../../src/domain/errors';

describe('presentError', () => {
  it('maps STEP.HTTP.TIMEOUT to a warning with suggested actions', () => {
    const error = stepTimeoutError('step-1', 30000, 3);
    const presentation = presentError(error);

    expect(presentation.severity).toBe('warning');
    expect(presentation.title).toBe('Step Timed Out');
    expect(presentation.userMessage).toContain('step-1');
    expect(presentation.retryable).toBe(true);
    expect(presentation.suggestedActions.length).toBeGreaterThan(0);
    expect(presentation.errorCode).toBe('STEP.HTTP.TIMEOUT');
    expect(presentation.stepId).toBe('step-1');
  });

  it('maps RATE_LIMIT errors to warnings', () => {
    const error = rateLimitError(5000);
    const presentation = presentError(error);

    expect(presentation.severity).toBe('warning');
    expect(presentation.title).toBe('Rate Limited');
    expect(presentation.retryable).toBe(true);
  });

  it('maps SECRETS.MISSING to an error with actions', () => {
    const error = secretMissingError('GOOGLE_API_KEY');
    const presentation = presentError(error);

    expect(presentation.severity).toBe('error');
    expect(presentation.title).toBe('Missing Secret');
    expect(presentation.retryable).toBe(false);
    expect(presentation.suggestedActions.length).toBeGreaterThan(0);
  });

  it('includes technical details', () => {
    const error = createTypedError({
      code: 'STEP.HTTP.TIMEOUT',
      message: 'Timed out',
      stepId: 'step-1',
      retryable: true,
      details: { timeoutMs: 30000, attempt: 3 },
    });

    const presentation = presentError(error);
    expect(presentation.technicalDetails).toContain('Code: STEP.HTTP.TIMEOUT');
    expect(presentation.technicalDetails).toContain('Step: step-1');
    expect(presentation.technicalDetails).toContain('timeoutMs');
  });

  it('falls back for unknown error codes', () => {
    const error = createTypedError({
      code: 'CUSTOM.UNKNOWN_ERROR',
      message: 'Something unusual happened',
      retryable: false,
    });

    const presentation = presentError(error);
    expect(presentation.severity).toBe('error');
    expect(presentation.title).toBe('Error');
    expect(presentation.userMessage).toBe('Something unusual happened');
  });

  it('includes TypedError suggested fixes in suggested actions', () => {
    const error = createTypedError({
      code: 'STEP.EXTERNAL_API.CONFIG',
      message: 'Model not found',
      retryable: false,
      suggestedFixes: [
        { type: 'FIX_MODEL_NAME', params: {}, description: 'Check the model name' },
      ],
    });

    const presentation = presentError(error);
    expect(presentation.suggestedActions).toContain('Check the model name');
  });
});

describe('presentErrors', () => {
  it('deduplicates by error code, keeping highest severity', () => {
    const errors = [
      createTypedError({
        code: 'STEP.HTTP.TIMEOUT',
        message: 'Timeout 1',
        retryable: true,
      }),
      createTypedError({
        code: 'STEP.HTTP.TIMEOUT',
        message: 'Timeout 2',
        retryable: true,
      }),
      createTypedError({
        code: 'SECRETS.MISSING',
        message: 'Missing key',
        retryable: false,
      }),
    ];

    const presentations = presentErrors(errors);
    expect(presentations).toHaveLength(2); // deduplicated timeouts
  });
});

describe('maxSeverity', () => {
  it('returns info for empty array', () => {
    expect(maxSeverity([])).toBe('info');
  });

  it('returns the highest severity', () => {
    const presentations = [
      presentError(rateLimitError()), // warning
      presentError(secretMissingError('KEY')), // error
    ];
    expect(maxSeverity(presentations)).toBe('error');
  });
});
