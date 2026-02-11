import { STEP_TYPE_CONFIG, LLM_SUBTYPE_CONFIG, getStepVisuals } from '../../src/react/step-type-config';
import type { FlowStep, UIStepType } from '../../src/react/types';

function makeStep(type: UIStepType, subtype?: string): FlowStep {
  return {
    id: 'test',
    name: 'Test Step',
    type,
    subtype,
    description: 'A test step',
    dependsOn: [],
  };
}

describe('STEP_TYPE_CONFIG', () => {
  it('has entries for all UI step types', () => {
    const types: UIStepType[] = ['llm', 'user-input', 'transform', 'validate', 'display', 'chat', 'external-input'];
    for (const type of types) {
      expect(STEP_TYPE_CONFIG[type]).toBeDefined();
      expect(STEP_TYPE_CONFIG[type].icon).toBeTruthy();
      expect(STEP_TYPE_CONFIG[type].label).toBeTruthy();
      expect(STEP_TYPE_CONFIG[type].shortLabel).toBeTruthy();
      expect(STEP_TYPE_CONFIG[type].color).toMatch(/^text-/);
      expect(STEP_TYPE_CONFIG[type].bg).toMatch(/^bg-/);
    }
  });
});

describe('LLM_SUBTYPE_CONFIG', () => {
  it('has entries for image and video subtypes', () => {
    expect(LLM_SUBTYPE_CONFIG.image).toBeDefined();
    expect(LLM_SUBTYPE_CONFIG.video).toBeDefined();
  });

  it('image subtype uses pink color scheme', () => {
    expect(LLM_SUBTYPE_CONFIG.image.color).toContain('pink');
  });

  it('video subtype uses rose color scheme', () => {
    expect(LLM_SUBTYPE_CONFIG.video.color).toContain('rose');
  });
});

describe('getStepVisuals', () => {
  it('returns base config for standard step types', () => {
    const step = makeStep('transform');
    const visuals = getStepVisuals(step);
    expect(visuals).toBe(STEP_TYPE_CONFIG.transform);
  });

  it('returns subtype config for llm with image subtype', () => {
    const step = makeStep('llm', 'image');
    const visuals = getStepVisuals(step);
    expect(visuals).toBe(LLM_SUBTYPE_CONFIG.image);
  });

  it('returns subtype config for llm with video subtype', () => {
    const step = makeStep('llm', 'video');
    const visuals = getStepVisuals(step);
    expect(visuals).toBe(LLM_SUBTYPE_CONFIG.video);
  });

  it('returns base llm config for unknown llm subtype', () => {
    const step = makeStep('llm', 'unknown-subtype');
    const visuals = getStepVisuals(step);
    expect(visuals).toBe(STEP_TYPE_CONFIG.llm);
  });

  it('returns base llm config for llm without subtype', () => {
    const step = makeStep('llm');
    const visuals = getStepVisuals(step);
    expect(visuals).toBe(STEP_TYPE_CONFIG.llm);
  });
});
