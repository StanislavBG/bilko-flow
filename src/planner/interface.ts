/**
 * Planner Interface — the contract-first boundary between
 * planning (agent reasoning) and orchestration.
 *
 * Planners produce proposals (draft workflows and changes)
 * rather than performing execution.
 */

import { DeterminismConfig } from '../domain/determinism';
import { TypedError } from '../domain/errors';
import { Workflow, Step, SecretRequirement } from '../domain/workflow';

/** Planner version declaration. */
export interface PlannerVersionInfo {
  /** Planner implementation name. */
  name: string;
  /** Planner implementation version. */
  version: string;
  /** Supported DSL spec versions. */
  supportedDslVersions: string[];
  /** Supported step pack versions. */
  supportedStepPacks: Array<{ name: string; version: string }>;
}

/** Goal description input for planning. */
export interface PlanGoal {
  /** Natural-language goal description. */
  description: string;
  /** Target DSL spec version. */
  targetDslVersion: string;
  /** Desired determinism grade. */
  determinismTarget?: DeterminismConfig;
  /** Available step types to use. */
  availableStepTypes?: string[];
  /** Constraints on planning. */
  constraints?: Record<string, unknown>;
}

/** A complete workflow draft proposed by a planner. */
export interface WorkflowProposal {
  /** Proposed workflow name. */
  name: string;
  description?: string;
  /** Target DSL spec version. */
  specVersion: string;
  /** Proposed determinism configuration. */
  determinism: DeterminismConfig;
  /** Proposed entry step. */
  entryStepId: string;
  /** Proposed steps. */
  steps: Omit<Step, 'workflowId'>[];
  /** Discovered secret requirements. */
  secrets: SecretRequirement[];
  /** Planner metadata. */
  plannerInfo: PlannerVersionInfo;
}

/** A structured patch against an existing workflow version. */
export interface WorkflowPatch {
  /** The workflow ID being patched. */
  workflowId: string;
  /** The base version being patched. */
  baseVersion: number;
  /** Steps to add. */
  addSteps?: Omit<Step, 'workflowId'>[];
  /** Steps to remove by ID. */
  removeStepIds?: string[];
  /** Steps to update (partial updates keyed by step ID). */
  updateSteps?: Record<string, Partial<Step>>;
  /** Updated determinism config. */
  determinism?: DeterminismConfig;
  /** Updated secret requirements. */
  secrets?: SecretRequirement[];
  /** Planner metadata. */
  plannerInfo: PlannerVersionInfo;
}

/** Explanation of planner reasoning (optional). */
export interface PlanExplanation {
  /** Reasoning steps taken. */
  reasoningSteps: Array<{
    step: string;
    description: string;
    assumptions: string[];
  }>;
  /** Overall confidence level. */
  confidence: 'high' | 'medium' | 'low';
}

/** Repair context provided to planners when errors occur. */
export interface RepairContext {
  /** The original workflow that failed. */
  workflow: Workflow;
  /** The typed errors encountered. */
  errors: TypedError[];
  /** The suggested fixes from the error model. */
  suggestedFixes: Array<{ errorCode: string; fixes: Array<{ type: string; params: Record<string, unknown> }> }>;
}

/**
 * Planner Interface.
 *
 * All planner implementations must satisfy this contract.
 * Planner outputs are treated as untrusted until validated.
 */
export interface Planner {
  /** Planner version and capability declarations. */
  getVersionInfo(): PlannerVersionInfo;

  /**
   * ProposeWorkflow: Convert a goal description into a complete
   * DSL document draft.
   */
  proposeWorkflow(goal: PlanGoal): Promise<WorkflowProposal>;

  /**
   * ProposePatch: Produce a structured patch against an existing
   * workflow version.
   */
  proposePatch(workflow: Workflow, goal: PlanGoal): Promise<WorkflowPatch>;

  /**
   * ProposeRepair: Given typed errors, propose DSL updates as a
   * patch candidate.
   */
  proposeRepair(context: RepairContext): Promise<WorkflowPatch>;

  /**
   * ExplainPlan (optional): Return reasoning steps and assumptions
   * for review.
   */
  explainPlan?(goal: PlanGoal): Promise<PlanExplanation>;
}
