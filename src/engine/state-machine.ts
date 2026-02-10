/**
 * Run and Step state machines.
 *
 * Enforces valid state transitions for runs and steps,
 * producing typed errors on invalid transitions.
 */

import {
  RunStatus,
  StepRunStatus,
  VALID_RUN_TRANSITIONS,
  VALID_STEP_TRANSITIONS,
} from '../domain/run';
import { TypedError, createTypedError } from '../domain/errors';

/** Result of a state transition attempt. */
export interface TransitionResult<S> {
  success: boolean;
  newStatus?: S;
  error?: TypedError;
}

/** Attempt a run state transition. */
export function transitionRunStatus(
  current: RunStatus,
  target: RunStatus,
): TransitionResult<RunStatus> {
  const validTargets = VALID_RUN_TRANSITIONS[current];
  if (!validTargets || !validTargets.includes(target)) {
    return {
      success: false,
      error: createTypedError({
        code: 'RUN.INVALID_TRANSITION',
        message: `Invalid run state transition: ${current} -> ${target}`,
        retryable: false,
        details: { current, target, validTargets },
      }),
    };
  }
  return { success: true, newStatus: target };
}

/** Attempt a step state transition. */
export function transitionStepStatus(
  current: StepRunStatus,
  target: StepRunStatus,
): TransitionResult<StepRunStatus> {
  const validTargets = VALID_STEP_TRANSITIONS[current];
  if (!validTargets || !validTargets.includes(target)) {
    return {
      success: false,
      error: createTypedError({
        code: 'STEP.INVALID_TRANSITION',
        message: `Invalid step state transition: ${current} -> ${target}`,
        retryable: false,
        details: { current, target, validTargets },
      }),
    };
  }
  return { success: true, newStatus: target };
}

/** Check if a run status is terminal. */
export function isTerminalRunStatus(status: RunStatus): boolean {
  return (
    status === RunStatus.Succeeded ||
    status === RunStatus.Failed ||
    status === RunStatus.Canceled
  );
}

/** Check if a step status is terminal. */
export function isTerminalStepStatus(status: StepRunStatus): boolean {
  return (
    status === StepRunStatus.Succeeded ||
    status === StepRunStatus.Failed ||
    status === StepRunStatus.Canceled
  );
}
