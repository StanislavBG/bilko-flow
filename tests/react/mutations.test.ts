import {
  applyMutation,
  createBlankStep,
  generateStepId,
} from '../../src/react/mutations';
import type { FlowDefinition, FlowStep } from '../../src/react/types';

function makeFlow(steps: FlowStep[]): FlowDefinition {
  return {
    id: 'test-flow',
    name: 'Test Flow',
    description: 'A test flow',
    version: '1.0.0',
    steps,
    tags: [],
  };
}

describe('generateStepId', () => {
  it('generates kebab-case from name', () => {
    expect(generateStepId('My New Step', new Set())).toBe('my-new-step');
  });

  it('avoids collisions with existing IDs', () => {
    const existing = new Set(['my-step']);
    expect(generateStepId('My Step', existing)).toBe('my-step-2');
  });

  it('increments suffix for multiple collisions', () => {
    const existing = new Set(['step', 'step-2', 'step-3']);
    expect(generateStepId('Step', existing)).toBe('step-4');
  });

  it('uses fallback for empty name', () => {
    expect(generateStepId('', new Set())).toBe('step');
  });
});

describe('createBlankStep', () => {
  it('creates a step with the given type and name', () => {
    const step = createBlankStep('llm', 'AI Step', new Set());
    expect(step.type).toBe('llm');
    expect(step.name).toBe('AI Step');
    expect(step.id).toBe('ai-step');
    expect(step.dependsOn).toEqual([]);
  });

  it('includes dependsOn when specified', () => {
    const step = createBlankStep('transform', 'Filter', new Set(), ['step-1']);
    expect(step.dependsOn).toEqual(['step-1']);
  });
});

describe('applyMutation', () => {
  const rootStep: FlowStep = {
    id: 'root',
    name: 'Root',
    type: 'user-input',
    description: 'Start',
    dependsOn: [],
  };
  const childStep: FlowStep = {
    id: 'child',
    name: 'Child',
    type: 'llm',
    description: 'Process',
    dependsOn: ['root'],
  };
  const baseFlow = makeFlow([rootStep, childStep]);

  describe('add-step', () => {
    it('adds a step to the flow', () => {
      const newStep = createBlankStep('transform', 'Transform', new Set(['root', 'child']), ['child']);
      const result = applyMutation(baseFlow, { type: 'add-step', step: newStep });

      expect(result.flow.steps).toHaveLength(3);
      expect(result.flow.steps[2].name).toBe('Transform');
      expect(result.valid).toBe(true);
      expect(result.description).toContain('Add step');
    });
  });

  describe('remove-step', () => {
    it('removes a step and cleans up dependencies', () => {
      const result = applyMutation(baseFlow, { type: 'remove-step', stepId: 'root' });

      expect(result.flow.steps).toHaveLength(1);
      expect(result.flow.steps[0].id).toBe('child');
      expect(result.flow.steps[0].dependsOn).toEqual([]);
      expect(result.description).toContain('Remove');
    });
  });

  describe('update-step', () => {
    it('updates step fields', () => {
      const result = applyMutation(baseFlow, {
        type: 'update-step',
        stepId: 'child',
        changes: { name: 'Updated Child', description: 'New description' },
      });

      expect(result.flow.steps[1].name).toBe('Updated Child');
      expect(result.flow.steps[1].description).toBe('New description');
      expect(result.valid).toBe(true);
    });

    it('returns descriptive message for missing step', () => {
      const result = applyMutation(baseFlow, {
        type: 'update-step',
        stepId: 'nonexistent',
        changes: { name: 'X' },
      });

      expect(result.description).toContain('not found');
    });
  });

  describe('connect', () => {
    it('adds a dependency edge', () => {
      const threeStepFlow = makeFlow([
        rootStep,
        childStep,
        { id: 'leaf', name: 'Leaf', type: 'display', description: '', dependsOn: [] },
      ]);

      const result = applyMutation(threeStepFlow, {
        type: 'connect',
        fromId: 'child',
        toId: 'leaf',
      });

      const leaf = result.flow.steps.find(s => s.id === 'leaf')!;
      expect(leaf.dependsOn).toContain('child');
    });

    it('does not duplicate existing connections', () => {
      const result = applyMutation(baseFlow, {
        type: 'connect',
        fromId: 'root',
        toId: 'child',
      });

      const child = result.flow.steps.find(s => s.id === 'child')!;
      expect(child.dependsOn.filter(d => d === 'root')).toHaveLength(1);
    });
  });

  describe('disconnect', () => {
    it('removes a dependency edge', () => {
      const result = applyMutation(baseFlow, {
        type: 'disconnect',
        fromId: 'root',
        toId: 'child',
      });

      const child = result.flow.steps.find(s => s.id === 'child')!;
      expect(child.dependsOn).not.toContain('root');
    });
  });

  describe('change-type', () => {
    it('changes the step type', () => {
      const result = applyMutation(baseFlow, {
        type: 'change-type',
        stepId: 'child',
        newType: 'transform',
      });

      expect(result.flow.steps[1].type).toBe('transform');
    });
  });

  describe('reorder-deps', () => {
    it('reorders dependencies', () => {
      const multiDepFlow = makeFlow([
        { id: 'a', name: 'A', type: 'user-input', description: '', dependsOn: [] },
        { id: 'b', name: 'B', type: 'llm', description: '', dependsOn: [] },
        { id: 'c', name: 'C', type: 'transform', description: '', dependsOn: ['a', 'b'] },
      ]);

      const result = applyMutation(multiDepFlow, {
        type: 'reorder-deps',
        stepId: 'c',
        newDeps: ['b', 'a'],
      });

      expect(result.flow.steps[2].dependsOn).toEqual(['b', 'a']);
    });
  });

  describe('batch', () => {
    it('applies multiple mutations in sequence', () => {
      const newStep = createBlankStep('validate', 'Validate', new Set(['root', 'child']), ['child']);
      const result = applyMutation(baseFlow, {
        type: 'batch',
        mutations: [
          { type: 'add-step', step: newStep },
          { type: 'update-step', stepId: 'root', changes: { name: 'Start' } },
        ],
        description: 'Add validate and rename root',
      });

      expect(result.flow.steps).toHaveLength(3);
      expect(result.flow.steps[0].name).toBe('Start');
      expect(result.description).toBe('Add validate and rename root');
    });
  });

  describe('validation', () => {
    it('detects cycles', () => {
      const result = applyMutation(baseFlow, {
        type: 'connect',
        fromId: 'child',
        toId: 'root',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.invariant === 'I1')).toBe(true);
    });

    it('detects duplicate IDs', () => {
      const dupStep: FlowStep = { id: 'root', name: 'Dupe', type: 'llm', description: '', dependsOn: [] };
      const result = applyMutation(baseFlow, { type: 'add-step', step: dupStep });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.invariant === 'I5')).toBe(true);
    });

    it('detects invalid dependencies', () => {
      const badStep: FlowStep = {
        id: 'bad',
        name: 'Bad',
        type: 'llm',
        description: '',
        dependsOn: ['nonexistent'],
      };
      const result = applyMutation(baseFlow, { type: 'add-step', step: badStep });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.invariant === 'I6')).toBe(true);
    });

    it('detects missing name', () => {
      const result = applyMutation(baseFlow, {
        type: 'update-step',
        stepId: 'child',
        changes: { name: '' },
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.invariant === 'I7')).toBe(true);
    });

    it('reports valid for a correct flow', () => {
      const newStep = createBlankStep('display', 'Output', new Set(['root', 'child']), ['child']);
      const result = applyMutation(baseFlow, { type: 'add-step', step: newStep });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  it('does not mutate the original flow', () => {
    const originalSteps = baseFlow.steps.map(s => ({ ...s, dependsOn: [...s.dependsOn] }));
    applyMutation(baseFlow, { type: 'remove-step', stepId: 'child' });

    expect(baseFlow.steps).toHaveLength(2);
    expect(baseFlow.steps[0].dependsOn).toEqual(originalSteps[0].dependsOn);
  });
});
