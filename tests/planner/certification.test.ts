import { certifyPlanner, validateProposal, validatePatch, applyPatch } from '../../src/planner/certification';
import { DefaultPlanner } from '../../src/planner/default-planner';
import { DeterminismGrade } from '../../src/domain/determinism';
import { Workflow, WorkflowStatus } from '../../src/domain/workflow';

describe('Planner Certification', () => {
  test('default planner passes certification', async () => {
    const planner = new DefaultPlanner();
    const result = await certifyPlanner(planner);

    expect(result.passed).toBe(true);
    expect(result.plannerInfo.name).toBe('bilko-default-planner');
    expect(result.tests.every(t => t.passed)).toBe(true);
  });

  test('planner version info is complete', () => {
    const planner = new DefaultPlanner();
    const info = planner.getVersionInfo();

    expect(info.name).toBeTruthy();
    expect(info.version).toBeTruthy();
    expect(info.supportedDslVersions).toContain('1.0.0');
  });

  test('planner proposes a valid workflow', async () => {
    const planner = new DefaultPlanner();
    const proposal = await planner.proposeWorkflow({
      description: 'Test workflow',
      targetDslVersion: '1.0.0',
      determinismTarget: { targetGrade: DeterminismGrade.Pure },
    });

    expect(proposal.name).toBeTruthy();
    expect(proposal.steps.length).toBeGreaterThan(0);
    expect(proposal.specVersion).toBe('1.0.0');

    const validation = validateProposal(proposal, 'acct_1', 'proj_1', 'env_1');
    expect(validation.valid).toBe(true);
  });

  test('planner proposes a valid repair', async () => {
    const planner = new DefaultPlanner();
    const workflow: Workflow = {
      id: 'wf_test',
      accountId: 'acct_1',
      projectId: 'proj_1',
      environmentId: 'env_1',
      name: 'Test',
      version: 1,
      specVersion: '1.0.0',
      status: WorkflowStatus.Active,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      determinism: { targetGrade: DeterminismGrade.Pure },
      entryStepId: 'step_1',
      steps: [
        {
          id: 'step_1', workflowId: 'wf_test', name: 'S1', type: 'transform.map',
          dependsOn: [], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 },
        },
      ],
      secrets: [],
    };

    const patch = await planner.proposeRepair({
      workflow,
      errors: [],
      suggestedFixes: [
        { errorCode: 'STEP.EXECUTION_ERROR', fixes: [{ type: 'INCREASE_TIMEOUT', params: { timeoutMs: 60000 } }] },
      ],
    });

    expect(patch.workflowId).toBe(workflow.id);
    expect(patch.baseVersion).toBe(workflow.version);

    const validation = validatePatch(patch, workflow);
    expect(validation.valid).toBe(true);
  });

  test('applyPatch creates new version', () => {
    const workflow: Workflow = {
      id: 'wf_test',
      accountId: 'acct_1',
      projectId: 'proj_1',
      environmentId: 'env_1',
      name: 'Test',
      version: 1,
      specVersion: '1.0.0',
      status: WorkflowStatus.Active,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      determinism: { targetGrade: DeterminismGrade.Pure },
      entryStepId: 'step_1',
      steps: [
        {
          id: 'step_1', workflowId: 'wf_test', name: 'S1', type: 'transform.map',
          dependsOn: [], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 },
        },
      ],
      secrets: [],
    };

    const result = applyPatch(workflow, {
      workflowId: 'wf_test',
      baseVersion: 1,
      addSteps: [
        {
          id: 'step_2', name: 'S2', type: 'transform.filter',
          dependsOn: ['step_1'], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 },
        },
      ],
      plannerInfo: new DefaultPlanner().getVersionInfo(),
    });

    expect(result.version).toBe(2);
    expect(result.steps).toHaveLength(2);
  });

  test('version mismatch in patch is rejected', () => {
    const workflow: Workflow = {
      id: 'wf_test',
      accountId: 'acct_1',
      projectId: 'proj_1',
      environmentId: 'env_1',
      name: 'Test',
      version: 2,
      specVersion: '1.0.0',
      status: WorkflowStatus.Active,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      determinism: { targetGrade: DeterminismGrade.Pure },
      entryStepId: 'step_1',
      steps: [
        {
          id: 'step_1', workflowId: 'wf_test', name: 'S1', type: 'transform.map',
          dependsOn: [], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 },
        },
      ],
      secrets: [],
    };

    const validation = validatePatch(
      {
        workflowId: 'wf_test',
        baseVersion: 1, // Mismatch!
        plannerInfo: new DefaultPlanner().getVersionInfo(),
      },
      workflow,
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.code === 'PLANNER.VERSION_CONFLICT')).toBe(true);
  });

  test('planner explains plan', async () => {
    const planner = new DefaultPlanner();
    const explanation = await planner.explainPlan!({
      description: 'Test plan',
      targetDslVersion: '1.0.0',
    });

    expect(explanation.reasoningSteps.length).toBeGreaterThan(0);
    expect(explanation.confidence).toBeTruthy();
  });
});
