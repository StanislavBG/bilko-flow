import { createExecutionStore, ExecutionStore } from '../../src/execution/execution-store';

describe('ExecutionStore', () => {
  let store: ExecutionStore;

  beforeEach(() => {
    store = createExecutionStore();
  });

  // ---- CRUD ---------------------------------------------------------------

  describe('createExecution', () => {
    it('creates an execution with a unique ID', () => {
      const exec = store.createExecution({ flowId: 'flow-a' });
      expect(exec.id).toBeDefined();
      expect(exec.flowId).toBe('flow-a');
      expect(exec.status).toBe('idle');
      expect(exec.childIds).toEqual([]);
      expect(exec.parentId).toBeUndefined();
    });

    it('assigns timestamps on creation', () => {
      const exec = store.createExecution({ flowId: 'flow-a' });
      expect(exec.createdAt).toBeGreaterThan(0);
      expect(exec.updatedAt).toBeGreaterThan(0);
    });

    it('attaches metadata', () => {
      const exec = store.createExecution({
        flowId: 'flow-a',
        metadata: { key: 'value' },
      });
      expect(exec.metadata).toEqual({ key: 'value' });
    });
  });

  describe('getExecution', () => {
    it('returns the execution by ID', () => {
      const exec = store.createExecution({ flowId: 'flow-a' });
      const found = store.getExecution(exec.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(exec.id);
    });

    it('returns undefined for unknown IDs', () => {
      expect(store.getExecution('nonexistent')).toBeUndefined();
    });
  });

  describe('setExecution', () => {
    it('upserts an execution', () => {
      const exec = store.createExecution({ flowId: 'flow-a' });
      exec.status = 'running';
      store.setExecution(exec);
      const found = store.getExecution(exec.id)!;
      expect(found.status).toBe('running');
    });
  });

  describe('deleteExecution', () => {
    it('removes the execution', () => {
      const exec = store.createExecution({ flowId: 'flow-a' });
      expect(store.deleteExecution(exec.id)).toBe(true);
      expect(store.getExecution(exec.id)).toBeUndefined();
    });

    it('returns false for unknown IDs', () => {
      expect(store.deleteExecution('nonexistent')).toBe(false);
    });

    it('unlinks from parent on delete', () => {
      const parent = store.createExecution({ flowId: 'parent' });
      const child = store.createExecution({ flowId: 'child', parentId: parent.id });
      expect(store.getExecution(parent.id)!.childIds).toContain(child.id);

      store.deleteExecution(child.id);
      expect(store.getExecution(parent.id)!.childIds).not.toContain(child.id);
    });
  });

  describe('listExecutions', () => {
    it('lists all executions', () => {
      store.createExecution({ flowId: 'a' });
      store.createExecution({ flowId: 'b' });
      expect(store.listExecutions()).toHaveLength(2);
    });
  });

  // ---- Status & step updates ------------------------------------------------

  describe('updateStatus', () => {
    it('transitions execution status', () => {
      const exec = store.createExecution({ flowId: 'flow-a' });
      const updated = store.updateStatus(exec.id, 'running');
      expect(updated!.status).toBe('running');
      expect(updated!.startedAt).toBeGreaterThan(0);
    });

    it('sets completedAt on terminal status', () => {
      const exec = store.createExecution({ flowId: 'flow-a' });
      store.updateStatus(exec.id, 'running');
      const completed = store.updateStatus(exec.id, 'completed');
      expect(completed!.completedAt).toBeGreaterThan(0);
    });

    it('returns undefined for unknown IDs', () => {
      expect(store.updateStatus('nonexistent', 'running')).toBeUndefined();
    });
  });

  describe('updateStep', () => {
    it('creates a new step entry', () => {
      const exec = store.createExecution({ flowId: 'flow-a' });
      const updated = store.updateStep(exec.id, 'step-1', {
        status: 'running',
        startedAt: Date.now(),
      });
      expect(updated!.steps['step-1'].status).toBe('running');
    });

    it('merges into existing step', () => {
      const exec = store.createExecution({ flowId: 'flow-a' });
      store.updateStep(exec.id, 'step-1', { status: 'running' });
      const updated = store.updateStep(exec.id, 'step-1', {
        status: 'success',
        output: { result: 42 },
      });
      expect(updated!.steps['step-1'].status).toBe('success');
      expect(updated!.steps['step-1'].output).toEqual({ result: 42 });
    });

    it('returns undefined for unknown execution', () => {
      expect(store.updateStep('nonexistent', 'step-1', { status: 'running' })).toBeUndefined();
    });
  });

  // ---- Tree operations -------------------------------------------------------

  describe('parent-child linking', () => {
    it('auto-links child to parent on creation', () => {
      const parent = store.createExecution({ flowId: 'parent' });
      const child = store.createExecution({ flowId: 'child', parentId: parent.id });

      expect(child.parentId).toBe(parent.id);
      expect(store.getExecution(parent.id)!.childIds).toContain(child.id);
    });

    it('linkChild links two existing executions', () => {
      const parent = store.createExecution({ flowId: 'parent' });
      const child = store.createExecution({ flowId: 'child' });

      store.linkChild(parent.id, child.id);
      expect(store.getExecution(parent.id)!.childIds).toContain(child.id);
      expect(store.getExecution(child.id)!.parentId).toBe(parent.id);
    });

    it('linkChild is idempotent', () => {
      const parent = store.createExecution({ flowId: 'parent' });
      const child = store.createExecution({ flowId: 'child' });

      store.linkChild(parent.id, child.id);
      store.linkChild(parent.id, child.id);
      expect(store.getExecution(parent.id)!.childIds.filter((id) => id === child.id)).toHaveLength(1);
    });

    it('unlinkChild removes the link', () => {
      const parent = store.createExecution({ flowId: 'parent' });
      const child = store.createExecution({ flowId: 'child', parentId: parent.id });

      store.unlinkChild(parent.id, child.id);
      expect(store.getExecution(parent.id)!.childIds).not.toContain(child.id);
      expect(store.getExecution(child.id)!.parentId).toBeUndefined();
    });

    it('unlinkChild is safe for non-linked executions', () => {
      const a = store.createExecution({ flowId: 'a' });
      const b = store.createExecution({ flowId: 'b' });
      // Should not throw
      store.unlinkChild(a.id, b.id);
    });
  });

  describe('getChildren', () => {
    it('returns direct children', () => {
      const parent = store.createExecution({ flowId: 'parent' });
      const child1 = store.createExecution({ flowId: 'c1', parentId: parent.id });
      const child2 = store.createExecution({ flowId: 'c2', parentId: parent.id });

      const children = store.getChildren(parent.id);
      expect(children).toHaveLength(2);
      expect(children.map((c) => c.id)).toContain(child1.id);
      expect(children.map((c) => c.id)).toContain(child2.id);
    });

    it('returns empty for no children', () => {
      const exec = store.createExecution({ flowId: 'flow-a' });
      expect(store.getChildren(exec.id)).toEqual([]);
    });

    it('returns empty for unknown parent', () => {
      expect(store.getChildren('nonexistent')).toEqual([]);
    });
  });

  describe('getParent', () => {
    it('returns the parent', () => {
      const parent = store.createExecution({ flowId: 'parent' });
      const child = store.createExecution({ flowId: 'child', parentId: parent.id });

      const found = store.getParent(child.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(parent.id);
    });

    it('returns undefined for root executions', () => {
      const exec = store.createExecution({ flowId: 'flow-a' });
      expect(store.getParent(exec.id)).toBeUndefined();
    });
  });

  describe('getExecutionTree', () => {
    it('builds a single-level tree', () => {
      const parent = store.createExecution({ flowId: 'parent' });
      store.createExecution({ flowId: 'c1', parentId: parent.id });
      store.createExecution({ flowId: 'c2', parentId: parent.id });

      const tree = store.getExecutionTree(parent.id);
      expect(tree).toBeDefined();
      expect(tree!.execution.id).toBe(parent.id);
      expect(tree!.children).toHaveLength(2);
    });

    it('builds a multi-level tree', () => {
      const root = store.createExecution({ flowId: 'root' });
      const mid = store.createExecution({ flowId: 'mid', parentId: root.id });
      store.createExecution({ flowId: 'leaf', parentId: mid.id });

      const tree = store.getExecutionTree(root.id)!;
      expect(tree.children).toHaveLength(1);
      expect(tree.children[0].children).toHaveLength(1);
      expect(tree.children[0].children[0].execution.flowId).toBe('leaf');
    });

    it('returns undefined for unknown root', () => {
      expect(store.getExecutionTree('nonexistent')).toBeUndefined();
    });
  });

  describe('getRoots', () => {
    it('returns only root executions', () => {
      const root1 = store.createExecution({ flowId: 'r1' });
      const root2 = store.createExecution({ flowId: 'r2' });
      store.createExecution({ flowId: 'child', parentId: root1.id });

      const roots = store.getRoots();
      expect(roots).toHaveLength(2);
      expect(roots.map((r) => r.id)).toContain(root1.id);
      expect(roots.map((r) => r.id)).toContain(root2.id);
    });
  });

  // ---- History ---------------------------------------------------------------

  describe('history', () => {
    it('records snapshots on mutations', () => {
      const exec = store.createExecution({ flowId: 'flow-a' });
      store.updateStatus(exec.id, 'running');
      store.updateStatus(exec.id, 'completed');

      const h = store.history(exec.id);
      expect(h.length).toBeGreaterThanOrEqual(3); // create + 2 updates
    });

    it('returns empty for unknown IDs', () => {
      expect(store.history('nonexistent')).toEqual([]);
    });

    it('respects maxHistory', () => {
      const smallStore = createExecutionStore({ maxHistory: 3 });
      const exec = smallStore.createExecution({ flowId: 'flow-a' });
      // create (1), then 5 step updates
      for (let i = 0; i < 5; i++) {
        smallStore.updateStep(exec.id, `step-${i}`, { status: 'success' });
      }
      expect(smallStore.history(exec.id).length).toBeLessThanOrEqual(3);
    });
  });

  // ---- Subscriptions ---------------------------------------------------------

  describe('subscribe', () => {
    it('notifies on any change', () => {
      const listener = jest.fn();
      store.subscribe(listener);

      store.createExecution({ flowId: 'flow-a' });
      expect(listener).toHaveBeenCalled();
    });

    it('unsubscribe stops notifications', () => {
      const listener = jest.fn();
      const unsub = store.subscribe(listener);
      unsub();

      store.createExecution({ flowId: 'flow-a' });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('subscribeToExecution', () => {
    it('notifies only for the target execution', () => {
      const exec = store.createExecution({ flowId: 'flow-a' });
      const listener = jest.fn();
      store.subscribeToExecution(exec.id, listener);

      // Change target
      store.updateStatus(exec.id, 'running');
      expect(listener).toHaveBeenCalledTimes(1);

      // Change unrelated
      store.createExecution({ flowId: 'flow-b' });
      expect(listener).toHaveBeenCalledTimes(1); // not called again
    });

    it('unsubscribe stops notifications', () => {
      const exec = store.createExecution({ flowId: 'flow-a' });
      const listener = jest.fn();
      const unsub = store.subscribeToExecution(exec.id, listener);
      unsub();

      store.updateStatus(exec.id, 'running');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ---- clear -----------------------------------------------------------------

  describe('clear', () => {
    it('removes all executions and history', () => {
      store.createExecution({ flowId: 'a' });
      store.createExecution({ flowId: 'b' });

      store.clear();
      expect(store.listExecutions()).toHaveLength(0);
    });
  });
});
