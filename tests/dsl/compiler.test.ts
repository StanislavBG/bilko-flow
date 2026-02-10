import { compileWorkflow } from '../../src/dsl/compiler';
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

describe('DSL Compiler', () => {
  test('compiles a valid workflow successfully', () => {
    const result = compileWorkflow(makeWorkflow());
    expect(result.success).toBe(true);
    expect(result.plan).toBeDefined();
    expect(result.plan!.executionOrder).toEqual(['step_1']);
    expect(result.plan!.steps['step_1']).toBeDefined();
  });

  test('produces correct topological order with dependencies', () => {
    const result = compileWorkflow(makeWorkflow({
      steps: [
        { id: 'step_1', workflowId: 'wf_test', name: 'S1', type: 'transform.map', dependsOn: [], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } },
        { id: 'step_2', workflowId: 'wf_test', name: 'S2', type: 'transform.filter', dependsOn: ['step_1'], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } },
        { id: 'step_3', workflowId: 'wf_test', name: 'S3', type: 'transform.reduce', dependsOn: ['step_2'], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } },
      ],
    }));
    expect(result.success).toBe(true);
    const order = result.plan!.executionOrder;
    expect(order.indexOf('step_1')).toBeLessThan(order.indexOf('step_2'));
    expect(order.indexOf('step_2')).toBeLessThan(order.indexOf('step_3'));
  });

  test('computes workflow and plan hashes', () => {
    const result = compileWorkflow(makeWorkflow());
    expect(result.plan!.workflowHash.algorithm).toBe('sha256');
    expect(result.plan!.workflowHash.digest).toBeTruthy();
    expect(result.plan!.planHash.algorithm).toBe('sha256');
    expect(result.plan!.planHash.digest).toBeTruthy();
  });

  test('determinism analysis identifies pure grade', () => {
    const result = compileWorkflow(makeWorkflow({
      determinism: { targetGrade: DeterminismGrade.Pure },
    }));
    expect(result.success).toBe(true);
    expect(result.plan!.determinismAnalysis.achievableGrade).toBe(DeterminismGrade.Pure);
    expect(result.plan!.determinismAnalysis.satisfied).toBe(true);
  });

  test('compiles step with default backoff strategy', () => {
    const result = compileWorkflow(makeWorkflow());
    const step = result.plan!.steps['step_1'];
    expect(step.policy.backoffStrategy).toBe('exponential');
    expect(step.policy.backoffBaseMs).toBe(1000);
  });

  test('fails compilation for invalid workflow', () => {
    const result = compileWorkflow({} as any);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('includes implementation version for each step', () => {
    const result = compileWorkflow(makeWorkflow());
    const step = result.plan!.steps['step_1'];
    expect(step.implementationVersion).toBe('transform.map@1.0.0');
  });
});
