import { LLMPlanner } from '../../src/llm/llm-planner';
import { registerLLMAdapter, LLMCallOptions, LLMRawResponse } from '../../src/llm/index';
import { PlanGoal, RepairContext } from '../../src/planner/interface';
import { DeterminismGrade } from '../../src/domain/determinism';
import { WorkflowStatus } from '../../src/domain/workflow';

describe('LLMPlanner', () => {
  let planner: LLMPlanner;

  // Mock adapter that returns pre-built JSON responses
  function registerMockAdapter(responseBuilder: (options: LLMCallOptions) => object) {
    registerLLMAdapter('custom', async (options: LLMCallOptions): Promise<LLMRawResponse> => {
      const response = responseBuilder(options);
      return { content: JSON.stringify(response), finishReason: 'stop' };
    });
  }

  beforeEach(() => {
    planner = new LLMPlanner({
      provider: 'custom',
      model: 'test-model',
      apiKey: 'test-key',
      temperature: 0.1,
      maxRetries: 1,
    });
  });

  describe('getVersionInfo', () => {
    test('returns correct planner version info', () => {
      const info = planner.getVersionInfo();
      expect(info.name).toBe('bilko-llm-planner-custom');
      expect(info.version).toBe('1.0.0');
      expect(info.supportedDslVersions).toContain('1.0.0');
    });
  });

  describe('proposeWorkflow', () => {
    test('produces a valid workflow proposal', async () => {
      registerMockAdapter(() => ({
        name: 'Data Pipeline',
        description: 'Fetches and transforms data',
        specVersion: '1.0.0',
        determinism: { targetGrade: 'best-effort' },
        entryStepId: 'fetch',
        steps: [
          {
            id: 'fetch',
            name: 'Fetch data',
            type: 'http.request',
            description: 'Fetch data from API',
            dependsOn: [],
            inputs: { url: 'https://api.example.com/data' },
            policy: { timeoutMs: 30000, maxAttempts: 3 },
          },
          {
            id: 'transform',
            name: 'Transform data',
            type: 'transform.map',
            description: 'Transform the fetched data',
            dependsOn: ['fetch'],
            inputs: { format: 'json' },
            policy: { timeoutMs: 10000, maxAttempts: 1 },
          },
        ],
        secrets: [{ key: 'API_TOKEN', required: true, description: 'API authentication token' }],
      }));

      const goal: PlanGoal = {
        description: 'Build a data pipeline that fetches and transforms API data',
        targetDslVersion: '1.0.0',
        determinismTarget: { targetGrade: DeterminismGrade.BestEffort },
      };

      const proposal = await planner.proposeWorkflow(goal);

      expect(proposal.name).toBe('Data Pipeline');
      expect(proposal.steps).toHaveLength(2);
      expect(proposal.entryStepId).toBe('fetch');
      expect(proposal.plannerInfo.name).toBe('bilko-llm-planner-custom');
      expect(proposal.secrets).toHaveLength(1);
    });

    test('fills in plannerInfo even if LLM omits it', async () => {
      registerMockAdapter(() => ({
        name: 'Simple Workflow',
        entryStepId: 'step1',
        steps: [{ id: 'step1', name: 'Step 1', type: 'custom', dependsOn: [], inputs: {}, policy: { timeoutMs: 5000, maxAttempts: 1 } }],
        secrets: [],
      }));

      const goal: PlanGoal = {
        description: 'Simple workflow',
        targetDslVersion: '1.0.0',
      };

      const proposal = await planner.proposeWorkflow(goal);
      expect(proposal.plannerInfo.name).toBe('bilko-llm-planner-custom');
      expect(proposal.specVersion).toBe('1.0.0');
    });
  });

  describe('proposePatch', () => {
    test('produces a valid workflow patch', async () => {
      registerMockAdapter(() => ({
        workflowId: 'wf_123',
        baseVersion: 1,
        addSteps: [
          {
            id: 'notify',
            name: 'Send notification',
            type: 'notification.send',
            dependsOn: ['step_2'],
            inputs: { message: 'Done' },
            policy: { timeoutMs: 5000, maxAttempts: 2 },
          },
        ],
        removeStepIds: [],
        updateSteps: {},
      }));

      const mockWorkflow = {
        id: 'wf_123',
        version: 1,
        steps: [],
      };

      const goal: PlanGoal = {
        description: 'Add a notification step at the end',
        targetDslVersion: '1.0.0',
      };

      const patch = await planner.proposePatch(mockWorkflow, goal);

      expect(patch.workflowId).toBe('wf_123');
      expect(patch.baseVersion).toBe(1);
      expect(patch.addSteps).toHaveLength(1);
      expect(patch.plannerInfo.name).toBe('bilko-llm-planner-custom');
    });
  });

  describe('proposeRepair', () => {
    test('produces repair patches for errors', async () => {
      registerMockAdapter(() => ({
        workflowId: 'wf_456',
        baseVersion: 2,
        updateSteps: {
          step_1: {
            policy: { timeoutMs: 60000, maxAttempts: 5 },
          },
        },
      }));

      const context: RepairContext = {
        workflow: {
          id: 'wf_456',
          accountId: 'acct_1',
          projectId: 'proj_1',
          environmentId: 'env_1',
          name: 'Test Workflow',
          version: 2,
          specVersion: '1.0.0',
          status: WorkflowStatus.Active,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          determinism: { targetGrade: DeterminismGrade.BestEffort },
          entryStepId: 'step_1',
          steps: [
            {
              id: 'step_1',
              workflowId: 'wf_456',
              name: 'Fetch',
              type: 'http.request',
              dependsOn: [],
              inputs: {},
              policy: { timeoutMs: 30000, maxAttempts: 3 },
            },
          ],
          secrets: [],
        },
        errors: [
          {
            code: 'STEP.HTTP.TIMEOUT',
            message: 'Request timed out',
            stepId: 'step_1',
            retryable: true,
            suggestedFixes: [{ type: 'INCREASE_TIMEOUT', params: { timeoutMs: 45000 } }],
          },
        ],
        suggestedFixes: [
          {
            errorCode: 'STEP.HTTP.TIMEOUT',
            fixes: [{ type: 'INCREASE_TIMEOUT', params: { timeoutMs: 45000 } }],
          },
        ],
      };

      const patch = await planner.proposeRepair(context);

      expect(patch.workflowId).toBe('wf_456');
      expect(patch.updateSteps?.step_1).toBeDefined();
      expect(patch.plannerInfo.name).toBe('bilko-llm-planner-custom');
    });
  });

  describe('explainPlan', () => {
    test('returns plan explanation with reasoning steps', async () => {
      registerMockAdapter(() => ({
        reasoningSteps: [
          {
            step: 'goal-analysis',
            description: 'Analyzed the data pipeline goal',
            assumptions: ['API is RESTful', 'Data is JSON'],
          },
          {
            step: 'step-selection',
            description: 'Selected http.request and transform.map steps',
            assumptions: ['Two-step pipeline sufficient'],
          },
        ],
        confidence: 'high',
      }));

      const goal: PlanGoal = {
        description: 'Build a data pipeline',
        targetDslVersion: '1.0.0',
      };

      const explanation = await planner.explainPlan(goal);

      expect(explanation.reasoningSteps).toHaveLength(2);
      expect(explanation.confidence).toBe('high');
    });

    test('normalizes invalid confidence to medium', async () => {
      registerMockAdapter(() => ({
        reasoningSteps: [{ step: 'test', description: 'test', assumptions: [] }],
        confidence: 'very-high', // invalid
      }));

      const goal: PlanGoal = {
        description: 'Test',
        targetDslVersion: '1.0.0',
      };

      const explanation = await planner.explainPlan(goal);
      expect(explanation.confidence).toBe('medium');
    });
  });

  describe('LLM prompt construction', () => {
    test('includes goal constraints in workflow prompt', async () => {
      let capturedPrompt = '';
      registerLLMAdapter('custom', async (options: LLMCallOptions): Promise<LLMRawResponse> => {
        capturedPrompt = options.messages[0].content;
        return {
          content: JSON.stringify({
            name: 'Test',
            entryStepId: 's1',
            steps: [{ id: 's1', name: 'S', type: 'custom', dependsOn: [], inputs: {}, policy: { timeoutMs: 1000, maxAttempts: 1 } }],
            secrets: [],
          }),
          finishReason: 'stop',
        };
      });

      await planner.proposeWorkflow({
        description: 'Test goal',
        targetDslVersion: '1.0.0',
        constraints: { maxSteps: 5 },
        availableStepTypes: ['http.request', 'transform.map'],
      });

      expect(capturedPrompt).toContain('Test goal');
      expect(capturedPrompt).toContain('maxSteps');
      expect(capturedPrompt).toContain('http.request, transform.map');
    });

    test('sends system prompt with DSL instructions', async () => {
      let capturedSystemPrompt = '';
      registerLLMAdapter('custom', async (options: LLMCallOptions): Promise<LLMRawResponse> => {
        capturedSystemPrompt = options.systemPrompt ?? '';
        return {
          content: JSON.stringify({
            name: 'Test',
            entryStepId: 's1',
            steps: [{ id: 's1', name: 'S', type: 'custom', dependsOn: [], inputs: {}, policy: { timeoutMs: 1000, maxAttempts: 1 } }],
            secrets: [],
          }),
          finishReason: 'stop',
        };
      });

      await planner.proposeWorkflow({
        description: 'Test',
        targetDslVersion: '1.0.0',
      });

      expect(capturedSystemPrompt).toContain('Bilko Flow');
      expect(capturedSystemPrompt).toContain('valid JSON');
      expect(capturedSystemPrompt).toContain('Step types available');
    });
  });
});
