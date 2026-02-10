import {
  transitionRunStatus,
  transitionStepStatus,
  isTerminalRunStatus,
  isTerminalStepStatus,
} from '../../src/engine/state-machine';
import { RunStatus, StepRunStatus } from '../../src/domain/run';

describe('Run State Machine', () => {
  test('valid transition: created -> queued', () => {
    const result = transitionRunStatus(RunStatus.Created, RunStatus.Queued);
    expect(result.success).toBe(true);
    expect(result.newStatus).toBe(RunStatus.Queued);
  });

  test('valid transition: queued -> running', () => {
    const result = transitionRunStatus(RunStatus.Queued, RunStatus.Running);
    expect(result.success).toBe(true);
    expect(result.newStatus).toBe(RunStatus.Running);
  });

  test('valid transition: running -> succeeded', () => {
    const result = transitionRunStatus(RunStatus.Running, RunStatus.Succeeded);
    expect(result.success).toBe(true);
  });

  test('valid transition: running -> failed', () => {
    const result = transitionRunStatus(RunStatus.Running, RunStatus.Failed);
    expect(result.success).toBe(true);
  });

  test('valid transition: running -> canceled', () => {
    const result = transitionRunStatus(RunStatus.Running, RunStatus.Canceled);
    expect(result.success).toBe(true);
  });

  test('invalid transition: succeeded -> running', () => {
    const result = transitionRunStatus(RunStatus.Succeeded, RunStatus.Running);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe('RUN.INVALID_TRANSITION');
  });

  test('invalid transition: failed -> running', () => {
    const result = transitionRunStatus(RunStatus.Failed, RunStatus.Running);
    expect(result.success).toBe(false);
  });

  test('terminal status detection', () => {
    expect(isTerminalRunStatus(RunStatus.Succeeded)).toBe(true);
    expect(isTerminalRunStatus(RunStatus.Failed)).toBe(true);
    expect(isTerminalRunStatus(RunStatus.Canceled)).toBe(true);
    expect(isTerminalRunStatus(RunStatus.Running)).toBe(false);
    expect(isTerminalRunStatus(RunStatus.Created)).toBe(false);
  });
});

describe('Step State Machine', () => {
  test('valid transition: pending -> running', () => {
    const result = transitionStepStatus(StepRunStatus.Pending, StepRunStatus.Running);
    expect(result.success).toBe(true);
  });

  test('valid transition: running -> succeeded', () => {
    const result = transitionStepStatus(StepRunStatus.Running, StepRunStatus.Succeeded);
    expect(result.success).toBe(true);
  });

  test('invalid transition: succeeded -> running', () => {
    const result = transitionStepStatus(StepRunStatus.Succeeded, StepRunStatus.Running);
    expect(result.success).toBe(false);
  });

  test('terminal status detection', () => {
    expect(isTerminalStepStatus(StepRunStatus.Succeeded)).toBe(true);
    expect(isTerminalStepStatus(StepRunStatus.Failed)).toBe(true);
    expect(isTerminalStepStatus(StepRunStatus.Canceled)).toBe(true);
    expect(isTerminalStepStatus(StepRunStatus.Pending)).toBe(false);
  });
});
