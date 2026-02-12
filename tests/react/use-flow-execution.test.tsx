import React from 'react';
import { render, act } from '@testing-library/react';
import { createExecutionStore } from '../../src/execution/execution-store';
import { useFlowExecution } from '../../src/react/use-flow-execution';
import type { FlowExecution } from '../../src/domain/execution';

interface TestProps {
  store: ReturnType<typeof createExecutionStore>;
  flowId: string;
  parentFlowId?: string;
  onExecution?: (exec: FlowExecution) => void;
  onChildren?: (children: FlowExecution[]) => void;
}

function TestComponent({ store, flowId, parentFlowId, onExecution, onChildren }: TestProps) {
  const {
    execution,
    start,
    complete,
    fail,
    cancel,
    updateStep,
    spawnChild,
    children,
    parent,
    executionId,
  } = useFlowExecution({ store, flowId, parentFlowId });

  // Report execution state via callback for assertions
  React.useEffect(() => {
    onExecution?.(execution);
  }, [execution, onExecution]);

  React.useEffect(() => {
    onChildren?.(children);
  }, [children, onChildren]);

  return (
    <div>
      <div data-testid="status">{execution.status}</div>
      <div data-testid="flow-id">{execution.flowId}</div>
      <div data-testid="exec-id">{executionId}</div>
      <div data-testid="parent-id">{parent?.id ?? 'none'}</div>
      <div data-testid="children-count">{children.length}</div>
      <div data-testid="error">{execution.error ?? 'none'}</div>
      <button data-testid="start" onClick={start} />
      <button data-testid="complete" onClick={complete} />
      <button data-testid="fail" onClick={() => fail('something broke')} />
      <button data-testid="cancel" onClick={cancel} />
      <button
        data-testid="update-step"
        onClick={() => updateStep('step-1', { status: 'running' })}
      />
      <button
        data-testid="spawn-child"
        onClick={() => spawnChild('child-flow')}
      />
    </div>
  );
}

describe('useFlowExecution', () => {
  it('creates an execution on mount', () => {
    const store = createExecutionStore();
    const { getByTestId } = render(
      <TestComponent store={store} flowId="test-flow" />,
    );

    expect(getByTestId('status').textContent).toBe('idle');
    expect(getByTestId('flow-id').textContent).toBe('test-flow');
    expect(getByTestId('exec-id').textContent).toBeTruthy();
    expect(store.listExecutions()).toHaveLength(1);
  });

  it('starts execution', () => {
    const store = createExecutionStore();
    const { getByTestId } = render(
      <TestComponent store={store} flowId="test-flow" />,
    );

    act(() => {
      getByTestId('start').click();
    });

    expect(getByTestId('status').textContent).toBe('running');
  });

  it('completes execution', () => {
    const store = createExecutionStore();
    const { getByTestId } = render(
      <TestComponent store={store} flowId="test-flow" />,
    );

    act(() => { getByTestId('start').click(); });
    act(() => { getByTestId('complete').click(); });

    expect(getByTestId('status').textContent).toBe('completed');
  });

  it('fails execution with error', () => {
    const store = createExecutionStore();
    const { getByTestId } = render(
      <TestComponent store={store} flowId="test-flow" />,
    );

    act(() => { getByTestId('start').click(); });
    act(() => { getByTestId('fail').click(); });

    expect(getByTestId('status').textContent).toBe('failed');
    expect(getByTestId('error').textContent).toBe('something broke');
  });

  it('cancels execution', () => {
    const store = createExecutionStore();
    const { getByTestId } = render(
      <TestComponent store={store} flowId="test-flow" />,
    );

    act(() => { getByTestId('start').click(); });
    act(() => { getByTestId('cancel').click(); });

    expect(getByTestId('status').textContent).toBe('cancelled');
  });

  it('updates a step', () => {
    const store = createExecutionStore();
    const { getByTestId } = render(
      <TestComponent store={store} flowId="test-flow" />,
    );

    act(() => { getByTestId('update-step').click(); });

    const execId = getByTestId('exec-id').textContent!;
    const exec = store.getExecution(execId)!;
    expect(exec.steps['step-1']).toBeDefined();
    expect(exec.steps['step-1'].status).toBe('running');
  });

  it('spawns child executions', () => {
    const store = createExecutionStore();
    const { getByTestId } = render(
      <TestComponent store={store} flowId="parent-flow" />,
    );

    act(() => { getByTestId('spawn-child').click(); });

    expect(store.listExecutions()).toHaveLength(2);
    const execId = getByTestId('exec-id').textContent!;
    const children = store.getChildren(execId);
    expect(children).toHaveLength(1);
    expect(children[0].flowId).toBe('child-flow');
  });

  it('links to parent on creation when parentFlowId provided', () => {
    const store = createExecutionStore();
    const parentExec = store.createExecution({ flowId: 'parent-flow' });

    const { getByTestId } = render(
      <TestComponent
        store={store}
        flowId="child-flow"
        parentFlowId={parentExec.id}
      />,
    );

    expect(getByTestId('parent-id').textContent).toBe(parentExec.id);
    expect(store.getExecution(parentExec.id)!.childIds).toHaveLength(1);
  });

  it('shows no parent when parentFlowId not provided', () => {
    const store = createExecutionStore();
    const { getByTestId } = render(
      <TestComponent store={store} flowId="solo-flow" />,
    );

    expect(getByTestId('parent-id').textContent).toBe('none');
  });
});
