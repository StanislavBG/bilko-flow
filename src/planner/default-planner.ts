/**
 * Default Planner Implementation.
 *
 * A reference planner that produces simple workflow proposals
 * based on goal descriptions. This serves as an example of
 * planner interface compliance.
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

export class DefaultPlanner implements Planner {
  getVersionInfo(): PlannerVersionInfo {
    return {
      name: 'bilko-default-planner',
      version: '1.0.0',
      supportedDslVersions: ['1.0.0'],
      supportedStepPacks: [
        { name: 'core', version: '1.0.0' },
      ],
    };
  }

  async proposeWorkflow(goal: PlanGoal): Promise<WorkflowProposal> {
    const steps: Omit<Step, 'workflowId'>[] = [];
    const secrets: SecretRequirement[] = [];

    // Simple heuristic: create a minimal pure transform workflow
    const targetGrade = goal.determinismTarget?.targetGrade ?? DeterminismGrade.BestEffort;

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

  async proposePatch(workflow: any, goal: PlanGoal): Promise<WorkflowPatch> {
    return {
      workflowId: workflow.id,
      baseVersion: workflow.version,
      updateSteps: {},
      plannerInfo: this.getVersionInfo(),
    };
  }

  async proposeRepair(context: RepairContext): Promise<WorkflowPatch> {
    const updateSteps: Record<string, Partial<Step>> = {};

    // Apply suggested fixes
    for (const { errorCode, fixes } of context.suggestedFixes) {
      for (const fix of fixes) {
        if (fix.type === 'INCREASE_TIMEOUT') {
          // Find the affected step and increase its timeout
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
