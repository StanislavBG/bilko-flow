import { compileWorkflow, validateHandlers } from '../../src/dsl/compiler';
import {
  registerStepHandler,
  executeStep,
  NonRetryableStepError,
  StepHandler,
  StepExecutionContext,
  getStepHandler,
  getRegisteredHandlers,
} from '../../src/engine/step-runner';
import { CompiledStep } from '../../src/dsl/compiler';
import { DeterminismGrade } from '../../src/domain/determinism';
import { StepRunStatus } from '../../src/domain/run';
import { Workflow, WorkflowStatus } from '../../src/domain/workflow';

// ─── Test helpers ──────────────────────────────────────────────────────────

const KNOWN_MODELS = ['gemini-2.5-flash-image', 'dall-e-3'];

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'wf_test',
    accountId: 'acct_1',
    projectId: 'proj_1',
    environmentId: 'env_1',
    name: 'Test Workflow',
    version: 1,
    specVersion: '1.0.0',
    status: WorkflowStatus.Active,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    determinism: { targetGrade: DeterminismGrade.BestEffort },
    entryStepId: 'step_1',
    steps: [
      {
        id: 'step_1',
        workflowId: 'wf_test',
        name: 'Step 1',
        type: 'transform.map',
        dependsOn: [],
        inputs: { data: [] },
        policy: { timeoutMs: 30000, maxAttempts: 1 },
      },
    ],
    secrets: [],
    ...overrides,
  };
}

function makeContext(): StepExecutionContext {
  return {
    runId: 'run_test',
    accountId: 'acct_1',
    projectId: 'proj_1',
    environmentId: 'env_1',
    secrets: {},
    upstreamOutputs: {},
    canceled: false,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Step Handler Contracts', () => {
  beforeEach(() => {
    // Register a handler with an inputContract for ai.generate-image
    registerStepHandler({
      type: 'ai.generate-image',
      inputContract: {
        model: {
          type: 'string',
          required: true,
          oneOf: () => KNOWN_MODELS,
          description: 'The image generation model to use',
        },
        prompt: {
          type: 'string',
          required: false,
          description: 'Text prompt for image generation',
        },
        aspectRatio: {
          type: 'string',
          required: false,
          oneOf: ['1:1', '16:9', '9:16', '4:3', '3:4'],
          description: 'Output aspect ratio',
        },
      },
      async validate(step: CompiledStep) {
        const model = step.inputs.model as string;
        if (!KNOWN_MODELS.includes(model)) {
          return { valid: false, errors: [`Model "${model}" is not available`] };
        }
        return { valid: true, errors: [] };
      },
      async execute(step: CompiledStep) {
        return { outputs: { imageUrl: 'https://example.com/image.png' } };
      },
    });
  });

  test('getStepHandler returns registered handler', () => {
    const handler = getStepHandler('ai.generate-image');
    expect(handler).toBeDefined();
    expect(handler!.type).toBe('ai.generate-image');
    expect(handler!.inputContract).toBeDefined();
  });

  test('getStepHandler returns undefined for unregistered type', () => {
    const handler = getStepHandler('nonexistent.type');
    expect(handler).toBeUndefined();
  });

  test('getRegisteredHandlers returns all handlers', () => {
    const handlers = getRegisteredHandlers();
    expect(handlers.has('ai.generate-image')).toBe(true);
  });

  test('compilation fails when model is not in oneOf list', () => {
    const result = compileWorkflow(makeWorkflow({
      steps: [
        {
          id: 'step_1',
          workflowId: 'wf_test',
          name: 'Generate Image',
          type: 'ai.generate-image',
          dependsOn: [],
          inputs: {
            model: 'gemini-2.5-flash-preview-image-generation', // WRONG model name
            prompt: 'A test image',
          },
          policy: { timeoutMs: 60000, maxAttempts: 2 },
        },
      ],
    }));

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('VALIDATION.HANDLER_CONTRACT');
    expect(result.errors[0].message).toContain('gemini-2.5-flash-preview-image-generation');
    expect(result.errors[0].message).toContain('gemini-2.5-flash-image');
    expect(result.errors[0].suggestedFixes!.length).toBeGreaterThan(0);
  });

  test('compilation succeeds with valid model name', () => {
    const result = compileWorkflow(makeWorkflow({
      steps: [
        {
          id: 'step_1',
          workflowId: 'wf_test',
          name: 'Generate Image',
          type: 'ai.generate-image',
          dependsOn: [],
          inputs: {
            model: 'gemini-2.5-flash-image', // Correct model name
            prompt: 'A test image',
          },
          policy: { timeoutMs: 60000, maxAttempts: 2 },
        },
      ],
    }));

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('compilation fails when required input is missing', () => {
    const result = compileWorkflow(makeWorkflow({
      steps: [
        {
          id: 'step_1',
          workflowId: 'wf_test',
          name: 'Generate Image',
          type: 'ai.generate-image',
          dependsOn: [],
          inputs: {
            prompt: 'A test image',
            // model is required but missing
          },
          policy: { timeoutMs: 60000, maxAttempts: 2 },
        },
      ],
    }));

    expect(result.success).toBe(false);
    expect(result.errors.some(e =>
      e.code === 'VALIDATION.HANDLER_CONTRACT' && e.message.includes('missing required input "model"')
    )).toBe(true);
  });

  test('compilation fails on type mismatch', () => {
    const result = compileWorkflow(makeWorkflow({
      steps: [
        {
          id: 'step_1',
          workflowId: 'wf_test',
          name: 'Generate Image',
          type: 'ai.generate-image',
          dependsOn: [],
          inputs: {
            model: 42, // Should be string, not number
            prompt: 'A test image',
          },
          policy: { timeoutMs: 60000, maxAttempts: 2 },
        },
      ],
    }));

    expect(result.success).toBe(false);
    expect(result.errors.some(e =>
      e.code === 'VALIDATION.HANDLER_CONTRACT' && e.message.includes('must be type "string"')
    )).toBe(true);
  });

  test('compilation passes with optional field omitted', () => {
    const result = compileWorkflow(makeWorkflow({
      steps: [
        {
          id: 'step_1',
          workflowId: 'wf_test',
          name: 'Generate Image',
          type: 'ai.generate-image',
          dependsOn: [],
          inputs: {
            model: 'gemini-2.5-flash-image',
            // prompt is optional, omitted
          },
          policy: { timeoutMs: 60000, maxAttempts: 2 },
        },
      ],
    }));

    expect(result.success).toBe(true);
  });

  test('compilation fails for invalid oneOf value on static enum', () => {
    const result = compileWorkflow(makeWorkflow({
      steps: [
        {
          id: 'step_1',
          workflowId: 'wf_test',
          name: 'Generate Image',
          type: 'ai.generate-image',
          dependsOn: [],
          inputs: {
            model: 'gemini-2.5-flash-image',
            aspectRatio: '21:9', // Not in allowed list
          },
          policy: { timeoutMs: 60000, maxAttempts: 2 },
        },
      ],
    }));

    expect(result.success).toBe(false);
    expect(result.errors.some(e =>
      e.code === 'VALIDATION.HANDLER_CONTRACT' && e.message.includes('21:9')
    )).toBe(true);
  });

  test('steps without registered handlers skip contract validation', () => {
    const result = compileWorkflow(makeWorkflow({
      steps: [
        {
          id: 'step_1',
          workflowId: 'wf_test',
          name: 'Transform',
          type: 'transform.map',
          dependsOn: [],
          inputs: { anything: 'goes' },
          policy: { timeoutMs: 30000, maxAttempts: 1 },
        },
      ],
    }));

    expect(result.success).toBe(true);
  });
});

describe('Async Handler Validation (validateHandlers)', () => {
  beforeEach(() => {
    registerStepHandler({
      type: 'ai.generate-image',
      inputContract: {
        model: { type: 'string', required: true, oneOf: () => KNOWN_MODELS },
      },
      async validate(step: CompiledStep) {
        const model = step.inputs.model as string;
        if (!KNOWN_MODELS.includes(model)) {
          return { valid: false, errors: [`Model "${model}" is not available in the API`] };
        }
        return { valid: true, errors: [] };
      },
      async execute() {
        return { outputs: {} };
      },
    });
  });

  test('validateHandlers returns errors for invalid model', async () => {
    const compilation = compileWorkflow(makeWorkflow({
      steps: [
        {
          id: 'step_1',
          workflowId: 'wf_test',
          name: 'Generate Image',
          type: 'transform.map', // Use transform.map so compile passes
          dependsOn: [],
          inputs: { model: 'nonexistent-model' },
          policy: { timeoutMs: 60000, maxAttempts: 1 },
        },
      ],
    }));
    expect(compilation.success).toBe(true);

    // Now manually create a step with ai.generate-image type and call validateHandlers
    const steps: Record<string, CompiledStep> = {
      'step_1': {
        id: 'step_1',
        name: 'Generate Image',
        type: 'ai.generate-image',
        inputs: { model: 'nonexistent-model' },
        policy: { timeoutMs: 60000, maxAttempts: 1, backoffStrategy: 'exponential', backoffBaseMs: 1000 },
        implementationVersion: 'ai.generate-image@1.0.0',
        dependencies: [],
        determinism: { pureFunction: false, usesTime: false, usesExternalApis: true },
      },
    };

    const errors = await validateHandlers(steps);
    expect(errors.length).toBe(1);
    expect(errors[0].code).toBe('VALIDATION.HANDLER_PREFLIGHT');
    expect(errors[0].message).toContain('nonexistent-model');
  });

  test('validateHandlers returns empty for valid model', async () => {
    const steps: Record<string, CompiledStep> = {
      'step_1': {
        id: 'step_1',
        name: 'Generate Image',
        type: 'ai.generate-image',
        inputs: { model: 'gemini-2.5-flash-image' },
        policy: { timeoutMs: 60000, maxAttempts: 1, backoffStrategy: 'exponential', backoffBaseMs: 1000 },
        implementationVersion: 'ai.generate-image@1.0.0',
        dependencies: [],
        determinism: { pureFunction: false, usesTime: false, usesExternalApis: true },
      },
    };

    const errors = await validateHandlers(steps);
    expect(errors).toHaveLength(0);
  });
});

describe('NonRetryableStepError', () => {
  test('step runner immediately fails on NonRetryableStepError without retrying', async () => {
    let executeCount = 0;

    registerStepHandler({
      type: 'ai.generate-image',
      async execute() {
        executeCount++;
        throw new NonRetryableStepError(
          'Model "bad-model" not found (404)',
          404,
        );
      },
    });

    const step: CompiledStep = {
      id: 'step_img',
      name: 'Generate Image',
      type: 'ai.generate-image',
      inputs: { model: 'bad-model' },
      policy: { timeoutMs: 30000, maxAttempts: 3, backoffStrategy: 'exponential', backoffBaseMs: 100 },
      implementationVersion: 'ai.generate-image@1.0.0',
      dependencies: [],
      determinism: { pureFunction: false, usesTime: false, usesExternalApis: true },
    };

    const result = await executeStep(step, makeContext());

    expect(result.status).toBe(StepRunStatus.Failed);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe('STEP.NON_RETRYABLE');
    expect(result.error!.retryable).toBe(false);
    expect(result.error!.details?.statusCode).toBe(404);
    // Should only execute once, not retry
    expect(executeCount).toBe(1);
    expect(result.attempts).toBe(1);
  });

  test('regular errors are retried up to maxAttempts', async () => {
    let executeCount = 0;

    registerStepHandler({
      type: 'ai.generate-image',
      async execute() {
        executeCount++;
        throw new Error('Transient server error (500)');
      },
    });

    const step: CompiledStep = {
      id: 'step_img',
      name: 'Generate Image',
      type: 'ai.generate-image',
      inputs: { model: 'gemini-2.5-flash-image' },
      policy: { timeoutMs: 30000, maxAttempts: 3, backoffStrategy: 'fixed', backoffBaseMs: 10 },
      implementationVersion: 'ai.generate-image@1.0.0',
      dependencies: [],
      determinism: { pureFunction: false, usesTime: false, usesExternalApis: true },
    };

    const result = await executeStep(step, makeContext());

    expect(result.status).toBe(StepRunStatus.Failed);
    expect(result.error!.code).toBe('STEP.EXECUTION_ERROR');
    // Should have retried all 3 attempts
    expect(executeCount).toBe(3);
    expect(result.attempts).toBe(3);
  });
});
