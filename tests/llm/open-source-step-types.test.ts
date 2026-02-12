import { validateWorkflow } from '../../src/dsl/validator';
import { compileWorkflow } from '../../src/dsl/compiler';
import { DeterminismGrade } from '../../src/domain/determinism';
import { WorkflowStatus, Workflow } from '../../src/domain/workflow';
import { VALID_STEP_TYPES } from '../../src/dsl/schema';

describe('Open-source step types in DSL schema', () => {
  test('ai.generate-text-local is a valid step type', () => {
    expect(VALID_STEP_TYPES).toContain('ai.generate-text-local');
  });

  test('ai.summarize-local is a valid step type', () => {
    expect(VALID_STEP_TYPES).toContain('ai.summarize-local');
  });

  test('ai.embed-local is a valid step type', () => {
    expect(VALID_STEP_TYPES).toContain('ai.embed-local');
  });
});

describe('Validation of workflows with local AI step types', () => {
  function createWorkflowWithStepType(stepType: string): Partial<Workflow> {
    return {
      name: 'Test Workflow',
      accountId: 'acct_1',
      projectId: 'proj_1',
      environmentId: 'env_1',
      specVersion: '1.0.0',
      determinism: { targetGrade: DeterminismGrade.BestEffort },
      entryStepId: 'step_1',
      steps: [
        {
          id: 'step_1',
          workflowId: 'wf_1',
          name: 'Local AI Step',
          type: stepType as any,
          dependsOn: [],
          inputs: { model: 'llama3', baseUrl: 'http://localhost:11434' },
          policy: { timeoutMs: 30000, maxAttempts: 3 },
        },
      ],
      secrets: [],
    };
  }

  test('ai.generate-text-local passes validation', () => {
    const result = validateWorkflow(createWorkflowWithStepType('ai.generate-text-local'));
    expect(result.valid).toBe(true);
  });

  test('ai.summarize-local passes validation', () => {
    const result = validateWorkflow(createWorkflowWithStepType('ai.summarize-local'));
    expect(result.valid).toBe(true);
  });

  test('ai.embed-local passes validation', () => {
    const result = validateWorkflow(createWorkflowWithStepType('ai.embed-local'));
    expect(result.valid).toBe(true);
  });

  test('local AI steps are treated as AI types for determinism analysis', () => {
    const workflow = createWorkflowWithStepType('ai.generate-text-local');
    (workflow as any).determinism = { targetGrade: DeterminismGrade.Pure };

    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.determinismViolations.length).toBeGreaterThan(0);
    expect(result.determinismViolations[0].rule).toBe('pure-no-ai');
  });

  test('local AI steps require external API declarations for replayable grade', () => {
    const workflow = createWorkflowWithStepType('ai.generate-text-local');
    (workflow as any).determinism = { targetGrade: DeterminismGrade.Replayable };

    const result = validateWorkflow(workflow);
    // Should have determinism violation because no usesExternalApis declared
    expect(result.determinismViolations.length).toBeGreaterThan(0);
  });

  test('compiles workflow with local AI step types', () => {
    const workflow = createWorkflowWithStepType('ai.generate-text-local') as Workflow;
    workflow.id = 'wf_1';
    workflow.version = 1;
    workflow.status = WorkflowStatus.Active;
    workflow.createdAt = '2024-01-01T00:00:00Z';
    workflow.updatedAt = '2024-01-01T00:00:00Z';

    const compiled = compileWorkflow(workflow);
    expect(compiled.success).toBe(true);
    expect(compiled.plan).toBeDefined();
    expect(compiled.plan!.steps['step_1'].type).toBe('ai.generate-text-local');
  });
});
