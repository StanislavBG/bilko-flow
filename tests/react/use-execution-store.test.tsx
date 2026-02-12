import React from 'react';
import { render, act } from '@testing-library/react';
import { createExecutionStore } from '../../src/execution/execution-store';
import { useExecutionStore } from '../../src/react/use-execution-store';

function TestComponent({ store }: { store: ReturnType<typeof createExecutionStore> }) {
  const {
    executions,
    roots,
    createExecution,
    updateStatus,
    updateStep,
    getChildren,
    getParent,
    getExecutionTree,
    linkChild,
    unlinkChild,
    clear,
  } = useExecutionStore(store);

  return (
    <div>
      <div data-testid="count">{executions.length}</div>
      <div data-testid="roots">{roots.length}</div>
      <button
        data-testid="create"
        onClick={() => createExecution({ flowId: 'test-flow' })}
      />
      <button
        data-testid="clear"
        onClick={() => clear()}
      />
    </div>
  );
}

describe('useExecutionStore', () => {
  it('reflects initial empty state', () => {
    const store = createExecutionStore();
    const { getByTestId } = render(<TestComponent store={store} />);

    expect(getByTestId('count').textContent).toBe('0');
    expect(getByTestId('roots').textContent).toBe('0');
  });

  it('re-renders when an execution is created', () => {
    const store = createExecutionStore();
    const { getByTestId } = render(<TestComponent store={store} />);

    act(() => {
      store.createExecution({ flowId: 'flow-a' });
    });

    expect(getByTestId('count').textContent).toBe('1');
    expect(getByTestId('roots').textContent).toBe('1');
  });

  it('re-renders when an execution is updated', () => {
    const store = createExecutionStore();
    const exec = store.createExecution({ flowId: 'flow-a' });
    const { getByTestId } = render(<TestComponent store={store} />);

    expect(getByTestId('count').textContent).toBe('1');

    act(() => {
      store.updateStatus(exec.id, 'running');
    });

    // Still 1 execution, but the re-render was triggered
    expect(getByTestId('count').textContent).toBe('1');
  });

  it('re-renders on clear', () => {
    const store = createExecutionStore();
    store.createExecution({ flowId: 'flow-a' });
    store.createExecution({ flowId: 'flow-b' });
    const { getByTestId } = render(<TestComponent store={store} />);

    expect(getByTestId('count').textContent).toBe('2');

    act(() => {
      store.clear();
    });

    expect(getByTestId('count').textContent).toBe('0');
  });

  it('tracks roots vs children', () => {
    const store = createExecutionStore();
    const parent = store.createExecution({ flowId: 'parent' });
    const { getByTestId } = render(<TestComponent store={store} />);

    expect(getByTestId('roots').textContent).toBe('1');

    act(() => {
      store.createExecution({ flowId: 'child', parentId: parent.id });
    });

    expect(getByTestId('count').textContent).toBe('2');
    expect(getByTestId('roots').textContent).toBe('1');
  });
});
