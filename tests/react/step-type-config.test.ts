import {
  STEP_TYPE_CONFIG,
  LLM_SUBTYPE_CONFIG,
  DOMAIN_STEP_TYPE_MAP,
  DEFAULT_FLOW_PROGRESS_THEME,
  getStepVisuals,
  mergeTheme,
} from '../../src/react/step-type-config';
import type { FlowStep, UIStepType, FlowProgressTheme } from '../../src/react/types';

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

describe('DOMAIN_STEP_TYPE_MAP', () => {
  it('maps all 15 domain step types', () => {
    const domainTypes = [
      'http.search', 'http.request',
      'transform.filter', 'transform.map', 'transform.reduce',
      'ai.summarize', 'ai.generate-text', 'ai.generate-image', 'ai.generate-video',
      'ai.generate-text-local', 'ai.summarize-local', 'ai.embed-local',
      'social.post', 'notification.send', 'custom',
    ];
    for (const t of domainTypes) {
      expect(DOMAIN_STEP_TYPE_MAP[t]).toBeDefined();
      expect(DOMAIN_STEP_TYPE_MAP[t].uiType).toBeTruthy();
      expect(DOMAIN_STEP_TYPE_MAP[t].accent).toMatch(/^bg-/);
    }
  });

  it('maps http types to external-input', () => {
    expect(DOMAIN_STEP_TYPE_MAP['http.search'].uiType).toBe('external-input');
    expect(DOMAIN_STEP_TYPE_MAP['http.request'].uiType).toBe('external-input');
  });

  it('maps transform types to transform', () => {
    expect(DOMAIN_STEP_TYPE_MAP['transform.filter'].uiType).toBe('transform');
    expect(DOMAIN_STEP_TYPE_MAP['transform.map'].uiType).toBe('transform');
    expect(DOMAIN_STEP_TYPE_MAP['transform.reduce'].uiType).toBe('transform');
  });

  it('maps ai types to llm', () => {
    expect(DOMAIN_STEP_TYPE_MAP['ai.summarize'].uiType).toBe('llm');
    expect(DOMAIN_STEP_TYPE_MAP['ai.generate-text'].uiType).toBe('llm');
  });
});

describe('DEFAULT_FLOW_PROGRESS_THEME', () => {
  it('has all required status colors', () => {
    expect(DEFAULT_FLOW_PROGRESS_THEME.activeColor).toMatch(/^bg-/);
    expect(DEFAULT_FLOW_PROGRESS_THEME.completedColor).toMatch(/^bg-/);
    expect(DEFAULT_FLOW_PROGRESS_THEME.errorColor).toMatch(/^bg-/);
    expect(DEFAULT_FLOW_PROGRESS_THEME.pendingColor).toMatch(/^bg-/);
  });

  it('has all required text colors', () => {
    expect(DEFAULT_FLOW_PROGRESS_THEME.activeTextColor).toMatch(/^text-/);
    expect(DEFAULT_FLOW_PROGRESS_THEME.completedTextColor).toMatch(/^text-/);
    expect(DEFAULT_FLOW_PROGRESS_THEME.errorTextColor).toMatch(/^text-/);
    expect(DEFAULT_FLOW_PROGRESS_THEME.pendingTextColor).toMatch(/^text-/);
  });

  it('has step colors for all UI step types', () => {
    const uiTypes: UIStepType[] = ['llm', 'user-input', 'transform', 'validate', 'display', 'chat', 'external-input'];
    for (const t of uiTypes) {
      expect(DEFAULT_FLOW_PROGRESS_THEME.stepColors[t]).toBeDefined();
      expect(DEFAULT_FLOW_PROGRESS_THEME.stepColors[t]).toMatch(/^bg-/);
    }
  });

  it('has step colors for domain step types', () => {
    const domainTypes = ['http.search', 'ai.summarize', 'transform.map', 'social.post'];
    for (const t of domainTypes) {
      expect(DEFAULT_FLOW_PROGRESS_THEME.stepColors[t]).toBeDefined();
    }
  });
});

describe('mergeTheme', () => {
  it('returns default theme when no override', () => {
    const result = mergeTheme();
    expect(result).toEqual(DEFAULT_FLOW_PROGRESS_THEME);
  });

  it('returns default theme when override is undefined', () => {
    const result = mergeTheme(undefined);
    expect(result).toEqual(DEFAULT_FLOW_PROGRESS_THEME);
  });

  it('overrides top-level properties', () => {
    const result = mergeTheme({ activeColor: 'bg-indigo-500' });
    expect(result.activeColor).toBe('bg-indigo-500');
    expect(result.completedColor).toBe(DEFAULT_FLOW_PROGRESS_THEME.completedColor);
  });

  it('deep merges stepColors', () => {
    const result = mergeTheme({
      stepColors: { 'custom-type': 'bg-teal-500' },
    });
    // New key should be present
    expect(result.stepColors['custom-type']).toBe('bg-teal-500');
    // Existing keys should be preserved
    expect(result.stepColors['llm']).toBe(DEFAULT_FLOW_PROGRESS_THEME.stepColors['llm']);
  });

  it('overrides existing stepColors entries', () => {
    const result = mergeTheme({
      stepColors: { llm: 'bg-indigo-600' },
    });
    expect(result.stepColors['llm']).toBe('bg-indigo-600');
  });

  it('preserves unrelated fields when overriding one field', () => {
    const result = mergeTheme({ errorColor: 'bg-orange-500' });
    expect(result.errorColor).toBe('bg-orange-500');
    expect(result.activeColor).toBe(DEFAULT_FLOW_PROGRESS_THEME.activeColor);
    expect(result.stepColors).toEqual(DEFAULT_FLOW_PROGRESS_THEME.stepColors);
  });
});
