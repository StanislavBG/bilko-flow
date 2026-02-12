/**
 * LLM-backed Planner — uses chatJSON() to produce workflow proposals.
 *
 * This planner wraps an LLM provider (Gemini, OpenAI, Claude, etc.)
 * and translates natural-language goals into Bilko DSL documents
 * through structured JSON prompting.
 *
 * All outputs are treated as untrusted and should be validated through
 * the DSL compiler/validator before acceptance (same as any planner).
 */

import {
  Planner,
  PlannerVersionInfo,
  PlanGoal,
  WorkflowProposal,
  WorkflowPatch,
  PlanExplanation,
  RepairContext,
} from '../planner/interface';
import { DeterminismGrade } from '../domain/determinism';
import { chatJSON, ChatOptions, LLMProvider, LLMParseError, LLMProviderError } from './index';

/** Configuration for the LLM planner. */
export interface LLMPlannerConfig {
  /** LLM provider to use. */
  provider: LLMProvider;
  /** Model identifier. */
  model: string;
  /** API key. */
  apiKey: string;
  /** Base URL override. */
  baseUrl?: string;
  /** Max tokens per response. */
  maxTokens?: number;
  /** Temperature for generation (lower = more deterministic). */
  temperature?: number;
  /** Max retries for JSON parsing. */
  maxRetries?: number;
}

/** System prompt that instructs the LLM on Bilko DSL output format. */
const SYSTEM_PROMPT = `You are a workflow planning engine for the Bilko Flow system.
You produce valid JSON conforming to the Bilko DSL specification.

CRITICAL: Your entire response must be a single valid JSON object. No markdown, no explanation text, no code fences.

Step types available:
- Cloud AI: ai.summarize, ai.generate-text, ai.generate-image, ai.generate-video
- Local/Open-Source AI: ai.generate-text-local, ai.summarize-local, ai.embed-local
- HTTP: http.search, http.request
- Transform: transform.filter, transform.map, transform.reduce
- Other: social.post, notification.send, custom

Use "ai.*-local" step types when the goal specifies local models, open-source models, or self-hosted inference (Ollama, vLLM, TGI, LocalAI). Local steps require a "model" field in inputs and optionally "baseUrl" for the inference server.

Each step must have: id, name, type, description, dependsOn (array of step IDs), inputs (object), policy (with timeoutMs and maxAttempts).

Determinism grades: strict, reproducible, best-effort, non-deterministic.`;

export class LLMPlanner implements Planner {
  private config: LLMPlannerConfig;

  constructor(config: LLMPlannerConfig) {
    this.config = config;
  }

  getVersionInfo(): PlannerVersionInfo {
    return {
      name: `bilko-llm-planner-${this.config.provider}`,
      version: '1.0.0',
      supportedDslVersions: ['1.0.0'],
      supportedStepPacks: [
        { name: 'core', version: '1.0.0' },
      ],
    };
  }

  async proposeWorkflow(goal: PlanGoal): Promise<WorkflowProposal> {
    const prompt = buildWorkflowPrompt(goal);

    const result = await this.callLLM<WorkflowProposal>(prompt);

    // Ensure planner info is set (LLM may not include it)
    result.plannerInfo = this.getVersionInfo();
    result.specVersion = result.specVersion || goal.targetDslVersion;
    result.determinism = result.determinism || {
      targetGrade: goal.determinismTarget?.targetGrade ?? DeterminismGrade.BestEffort,
    };

    return result;
  }

  async proposePatch(workflow: any, goal: PlanGoal): Promise<WorkflowPatch> {
    const prompt = buildPatchPrompt(workflow, goal);

    const result = await this.callLLM<WorkflowPatch>(prompt);

    result.plannerInfo = this.getVersionInfo();
    result.workflowId = result.workflowId || workflow.id;
    result.baseVersion = result.baseVersion || workflow.version;

    return result;
  }

  async proposeRepair(context: RepairContext): Promise<WorkflowPatch> {
    const prompt = buildRepairPrompt(context);

    const result = await this.callLLM<WorkflowPatch>(prompt);

    result.plannerInfo = this.getVersionInfo();
    result.workflowId = result.workflowId || context.workflow.id;
    result.baseVersion = result.baseVersion || context.workflow.version;

    return result;
  }

  async explainPlan(goal: PlanGoal): Promise<PlanExplanation> {
    const prompt = buildExplainPrompt(goal);

    const result = await this.callLLM<PlanExplanation>(prompt);

    // Ensure confidence is a valid enum value
    if (!['high', 'medium', 'low'].includes(result.confidence)) {
      result.confidence = 'medium';
    }

    return result;
  }

  /** Internal helper to call chatJSON with standard config. */
  private async callLLM<T>(userPrompt: string): Promise<T> {
    const options: ChatOptions = {
      provider: this.config.provider,
      model: this.config.model,
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      maxTokens: this.config.maxTokens ?? 4096,
      temperature: this.config.temperature ?? 0.2,
      maxRetries: this.config.maxRetries ?? 3,
      systemPrompt: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    };

    return chatJSON<T>(options);
  }
}

// ─── Prompt Builders ────────────────────────────────────────────────────────

function buildWorkflowPrompt(goal: PlanGoal): string {
  const constraints = goal.constraints
    ? `\nAdditional constraints: ${JSON.stringify(goal.constraints)}`
    : '';
  const stepTypes = goal.availableStepTypes
    ? `\nAvailable step types: ${goal.availableStepTypes.join(', ')}`
    : '';
  const determinism = goal.determinismTarget
    ? `\nDeterminism target: ${goal.determinismTarget.targetGrade}`
    : '';

  return `Create a workflow for the following goal:

Goal: ${goal.description}
Target DSL version: ${goal.targetDslVersion}${determinism}${stepTypes}${constraints}

Respond with a JSON object matching this schema:
{
  "name": "string (workflow name, max 100 chars)",
  "description": "string (what this workflow does)",
  "specVersion": "${goal.targetDslVersion}",
  "determinism": { "targetGrade": "strict|reproducible|best-effort|non-deterministic" },
  "entryStepId": "string (ID of the first step)",
  "steps": [
    {
      "id": "string (unique step ID)",
      "name": "string (step name)",
      "type": "string (step type)",
      "description": "string",
      "dependsOn": ["array of prerequisite step IDs"],
      "inputs": {},
      "policy": { "timeoutMs": number, "maxAttempts": number }
    }
  ],
  "secrets": [{ "key": "string", "required": boolean, "description": "string" }]
}`;
}

function buildPatchPrompt(workflow: any, goal: PlanGoal): string {
  return `Modify the following workflow to achieve a new goal.

Current workflow (ID: ${workflow.id}, version: ${workflow.version}):
${JSON.stringify(workflow, null, 2)}

New goal: ${goal.description}

Respond with a JSON patch object:
{
  "workflowId": "${workflow.id}",
  "baseVersion": ${workflow.version},
  "addSteps": [/* new steps to add */],
  "removeStepIds": [/* step IDs to remove */],
  "updateSteps": { /* stepId: { partial step updates } */ }
}`;
}

function buildRepairPrompt(context: RepairContext): string {
  const errorSummary = context.errors
    .map((e) => `  - ${e.code}: ${e.message}${e.stepId ? ` (step: ${e.stepId})` : ''}`)
    .join('\n');

  const fixSummary = context.suggestedFixes
    .map((sf) => sf.fixes.map((f) => `  - ${f.type}: ${JSON.stringify(f.params)}`).join('\n'))
    .join('\n');

  return `The following workflow encountered errors during execution. Propose repairs.

Workflow (ID: ${context.workflow.id}, version: ${context.workflow.version}):
${JSON.stringify(context.workflow, null, 2)}

Errors:
${errorSummary}

Suggested fixes:
${fixSummary}

Respond with a JSON patch object:
{
  "workflowId": "${context.workflow.id}",
  "baseVersion": ${context.workflow.version},
  "addSteps": [],
  "removeStepIds": [],
  "updateSteps": { /* stepId: { partial step updates } */ }
}`;
}

function buildExplainPrompt(goal: PlanGoal): string {
  return `Explain your planning reasoning for the following goal:

Goal: ${goal.description}
Target DSL version: ${goal.targetDslVersion}

Respond with a JSON object:
{
  "reasoningSteps": [
    {
      "step": "string (step identifier)",
      "description": "string (what this reasoning step does)",
      "assumptions": ["array of assumptions made"]
    }
  ],
  "confidence": "high|medium|low"
}`;
}
