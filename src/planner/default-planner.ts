/**
 * Default Planner — Reference Protocol Implementation.
 *
 * This is a conformance reference for the Planner protocol, NOT an
 * AI-powered planning engine. It demonstrates:
 *
 * 1. How to implement the Planner interface correctly
 * 2. How proposeWorkflow/proposePatch/proposeRepair/explainPlan work
 * 3. How the certification suite validates planner outputs
 *
 * Real planner implementations would wrap an LLM or planning engine
 * (e.g., Claude, GPT, custom solver) and produce domain-appropriate
 * step graphs. The key contract: planner outputs are always validated
 * against the DSL before acceptance (untrusted until certified).
 *
 * To implement your own planner, implement the `Planner` interface
 * from ./interface.ts and pass it through `certifyPlanner()` to
 * verify conformance.
 */

import { DeterminismGrade } from '../domain/determinism';
import { Step, SecretRequirement } from '../domain/workflow';
import {
  Planner,
  PlannerVersionInfo,
  PlanGoal,
  WorkflowProposal,
  WorkflowPatch,
  PlanExplanation,
  RepairContext,
} from './interface';

/**
 * Reference planner that produces minimal valid workflow proposals.
 * Used for protocol conformance testing and as a template for
 * custom planner implementations.
 */
export class DefaultPlanner implements Planner {
  getVersionInfo(): PlannerVersionInfo {
    return {
      name: 'bilko-reference-planner',
      version: '1.0.0',
      supportedDslVersions: ['1.0.0'],
      supportedStepPacks: [
        { name: 'core', version: '1.0.0' },
      ],
    };
  }

  /**
   * Propose a minimal valid workflow for a goal.
   *
   * A real implementation would analyze the goal description,
   * select appropriate step types, configure inputs/outputs,
   * and declare accurate determinism properties.
   */
  async proposeWorkflow(goal: PlanGoal): Promise<WorkflowProposal> {
    const steps: Omit<Step, 'workflowId'>[] = [];
    const secrets: SecretRequirement[] = [];

    const targetGrade = goal.determinismTarget?.targetGrade ?? DeterminismGrade.BestEffort;

    // Reference: produce a minimal 2-step pure transform pipeline
    steps.push({
      id: 'step_1',
      name: 'Process input',
      type: 'transform.map',
      description: `Process input data for: ${goal.description}`,
      dependsOn: [],
      inputs: { data: [] },
      policy: { timeoutMs: 30000, maxAttempts: 1 },
      determinism: {
        usesTime: false,
        usesExternalApis: false,
        pureFunction: true,
      },
    });

    steps.push({
      id: 'step_2',
      name: 'Format output',
      type: 'transform.map',
      description: 'Format processed data for output',
      dependsOn: ['step_1'],
      inputs: { format: 'json' },
      policy: { timeoutMs: 30000, maxAttempts: 1 },
      determinism: {
        usesTime: false,
        usesExternalApis: false,
        pureFunction: true,
      },
    });

    return {
      name: `Workflow: ${goal.description.slice(0, 50)}`,
      description: goal.description,
      specVersion: goal.targetDslVersion,
      determinism: {
        targetGrade: targetGrade as DeterminismGrade,
      },
      entryStepId: 'step_1',
      steps,
      secrets,
      plannerInfo: this.getVersionInfo(),
    };
  }

  /**
   * Propose a patch to an existing workflow.
   *
   * A real implementation would analyze the goal delta and produce
   * targeted step additions, removals, or updates.
   */
  async proposePatch(workflow: any, goal: PlanGoal): Promise<WorkflowPatch> {
    return {
      workflowId: workflow.id,
      baseVersion: workflow.version,
      updateSteps: {},
      plannerInfo: this.getVersionInfo(),
    };
  }

  /**
   * Propose repairs based on typed errors and suggested fixes.
   *
   * This reference implementation applies machine-actionable
   * suggested fixes (e.g., INCREASE_TIMEOUT). A real planner
   * could apply more sophisticated reasoning.
   */
  async proposeRepair(context: RepairContext): Promise<WorkflowPatch> {
    const updateSteps: Record<string, Partial<Step>> = {};

    for (const { errorCode, fixes } of context.suggestedFixes) {
      for (const fix of fixes) {
        if (fix.type === 'INCREASE_TIMEOUT') {
          for (const step of context.workflow.steps) {
            if (step.policy.timeoutMs < (fix.params.timeoutMs as number)) {
              updateSteps[step.id] = {
                policy: {
                  ...step.policy,
                  timeoutMs: fix.params.timeoutMs as number,
                },
              };
            }
          }
        }
      }
    }

    return {
      workflowId: context.workflow.id,
      baseVersion: context.workflow.version,
      updateSteps,
      plannerInfo: this.getVersionInfo(),
    };
  }

  /**
   * Explain planning reasoning.
   *
   * A real implementation would provide detailed reasoning from
   * the underlying planning engine or LLM.
   */
  async explainPlan(goal: PlanGoal): Promise<PlanExplanation> {
    return {
      reasoningSteps: [
        {
          step: 'goal-analysis',
          description: `Analyzed goal: ${goal.description}`,
          assumptions: ['Input data is available', 'Output format is JSON'],
        },
        {
          step: 'step-decomposition',
          description: 'Decomposed into input processing and output formatting',
          assumptions: ['Two-step pipeline is sufficient'],
        },
        {
          step: 'determinism-assessment',
          description: `Target grade: ${goal.determinismTarget?.targetGrade ?? 'best-effort'}`,
          assumptions: ['Pure transform steps satisfy determinism requirements'],
        },
      ],
      confidence: 'medium',
    };
  }
}
