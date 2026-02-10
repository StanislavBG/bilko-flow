import { validateWorkflow } from '../../src/dsl/validator';
import { DeterminismGrade } from '../../src/domain/determinism';
import { Workflow, WorkflowStatus } from '../../src/domain/workflow';

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

describe('DSL Validator', () => {
  test('valid workflow passes validation', () => {
    const result = validateWorkflow(makeWorkflow());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('missing required fields produces errors', () => {
    const result = validateWorkflow({} as any);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.code === 'VALIDATION.REQUIRED_FIELD')).toBe(true);
  });

  test('invalid determinism grade produces error', () => {
    const result = validateWorkflow(makeWorkflow({
      determinism: { targetGrade: 'invalid' as any },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'VALIDATION.INVALID_DETERMINISM_GRADE')).toBe(true);
  });

  test('duplicate step IDs detected', () => {
    const result = validateWorkflow(makeWorkflow({
      steps: [
        { id: 'step_1', workflowId: 'wf_test', name: 'S1', type: 'transform.map', dependsOn: [], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } },
        { id: 'step_1', workflowId: 'wf_test', name: 'S2', type: 'transform.map', dependsOn: [], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } },
      ],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'VALIDATION.DUPLICATE_STEP_ID')).toBe(true);
  });

  test('self-dependency detected', () => {
    const result = validateWorkflow(makeWorkflow({
      steps: [
        { id: 'step_1', workflowId: 'wf_test', name: 'S1', type: 'transform.map', dependsOn: ['step_1'], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } },
      ],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'VALIDATION.SELF_DEPENDENCY')).toBe(true);
  });

  test('invalid entry step detected', () => {
    const result = validateWorkflow(makeWorkflow({
      entryStepId: 'nonexistent',
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'VALIDATION.INVALID_ENTRY_STEP')).toBe(true);
  });

  test('empty steps array produces error', () => {
    const result = validateWorkflow(makeWorkflow({ steps: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'VALIDATION.EMPTY_STEPS')).toBe(true);
  });

  test('invalid step type produces error', () => {
    const result = validateWorkflow(makeWorkflow({
      steps: [
        { id: 'step_1', workflowId: 'wf_test', name: 'S1', type: 'invalid.type' as any, dependsOn: [], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } },
      ],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'VALIDATION.INVALID_STEP_TYPE')).toBe(true);
  });

  test('timeout too low produces error', () => {
    const result = validateWorkflow(makeWorkflow({
      steps: [
        { id: 'step_1', workflowId: 'wf_test', name: 'S1', type: 'transform.map', dependsOn: [], inputs: {}, policy: { timeoutMs: 100, maxAttempts: 1 } },
      ],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'VALIDATION.TIMEOUT_TOO_LOW')).toBe(true);
  });

  test('pure grade with external API step produces determinism violation', () => {
    const result = validateWorkflow(makeWorkflow({
      determinism: { targetGrade: DeterminismGrade.Pure },
      steps: [
        { id: 'step_1', workflowId: 'wf_test', name: 'S1', type: 'http.search', dependsOn: [], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } },
      ],
    }));
    expect(result.valid).toBe(false);
    expect(result.determinismViolations.length).toBeGreaterThan(0);
    expect(result.determinismViolations[0].rule).toBe('pure-no-external-api');
  });

  test('pure grade with AI step produces determinism violation', () => {
    const result = validateWorkflow(makeWorkflow({
      determinism: { targetGrade: DeterminismGrade.Pure },
      steps: [
        { id: 'step_1', workflowId: 'wf_test', name: 'S1', type: 'ai.summarize', dependsOn: [], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } },
      ],
    }));
    expect(result.valid).toBe(false);
    expect(result.determinismViolations.some(v => v.rule === 'pure-no-ai')).toBe(true);
  });

  test('replayable grade requires external API declaration', () => {
    const result = validateWorkflow(makeWorkflow({
      determinism: { targetGrade: DeterminismGrade.Replayable },
      steps: [
        { id: 'step_1', workflowId: 'wf_test', name: 'S1', type: 'http.search', dependsOn: [], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } },
      ],
    }));
    expect(result.valid).toBe(false);
    expect(result.determinismViolations.some(v => v.rule === 'replayable-declare-external')).toBe(true);
  });

  test('replayable grade with proper declarations passes', () => {
    const result = validateWorkflow(makeWorkflow({
      determinism: { targetGrade: DeterminismGrade.Replayable },
      steps: [
        {
          id: 'step_1', workflowId: 'wf_test', name: 'S1', type: 'http.search',
          dependsOn: [], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 },
          determinism: {
            usesExternalApis: true,
            externalDependencies: [
              { name: 'news-api', kind: 'http-api', deterministic: false, evidenceCapture: 'full-response' },
            ],
          },
        },
      ],
    }));
    expect(result.valid).toBe(true);
  });

  test('dependency cycle detected', () => {
    const result = validateWorkflow(makeWorkflow({
      entryStepId: 'step_1',
      steps: [
        { id: 'step_1', workflowId: 'wf_test', name: 'S1', type: 'transform.map', dependsOn: ['step_2'], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } },
        { id: 'step_2', workflowId: 'wf_test', name: 'S2', type: 'transform.map', dependsOn: ['step_1'], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } },
      ],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'VALIDATION.CYCLE_DETECTED')).toBe(true);
  });

  test('unsupported spec version produces error', () => {
    const result = validateWorkflow(makeWorkflow({
      specVersion: '99.0.0',
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'VALIDATION.UNSUPPORTED_VERSION')).toBe(true);
  });
});
