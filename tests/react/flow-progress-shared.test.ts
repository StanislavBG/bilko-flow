/**
 * Tests for v0.3.0 additions to flow-progress-shared:
 *   - resolveStepMeta() — well-known meta key extraction
 *   - applyStatusMap() — custom status vocabulary mapping
 *   - getStatusIcon() — centralized status icon resolution
 *   - resolveStepBg() / resolveStepTextColor() — skipped status handling
 */

import {
  resolveStepMeta,
  applyStatusMap,
  getStatusIcon,
  resolveStepBg,
  resolveStepTextColor,
  resolveConnectorColor,
  resolveAutoMode,
  DEFAULT_AUTO_BREAKPOINTS,
} from '../../src/react/flow-progress-shared';
import { DEFAULT_FLOW_PROGRESS_THEME } from '../../src/react/step-type-config';
import type { FlowProgressStep } from '../../src/react/types';

describe('resolveStepMeta', () => {
  it('returns all undefined for undefined meta', () => {
    const result = resolveStepMeta(undefined);
    expect(result.message).toBeUndefined();
    expect(result.progress).toBeUndefined();
    expect(result.mediaType).toBeUndefined();
    expect(result.mediaUri).toBeUndefined();
    expect(result.skipReason).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('returns all undefined for empty meta', () => {
    const result = resolveStepMeta({});
    expect(result.message).toBeUndefined();
    expect(result.progress).toBeUndefined();
  });

  it('extracts well-known string keys', () => {
    const result = resolveStepMeta({
      message: 'Chunk 2/5 — 3.2 MB',
      mediaType: 'audio/mpeg',
      mediaUri: '/stream/abc',
      skipReason: 'Already MP3',
      error: 'Connection failed',
    });
    expect(result.message).toBe('Chunk 2/5 — 3.2 MB');
    expect(result.mediaType).toBe('audio/mpeg');
    expect(result.mediaUri).toBe('/stream/abc');
    expect(result.skipReason).toBe('Already MP3');
    expect(result.error).toBe('Connection failed');
  });

  it('extracts progress as a number between 0 and 1', () => {
    expect(resolveStepMeta({ progress: 0 }).progress).toBe(0);
    expect(resolveStepMeta({ progress: 0.5 }).progress).toBe(0.5);
    expect(resolveStepMeta({ progress: 1 }).progress).toBe(1);
  });

  it('rejects progress outside 0-1 range', () => {
    expect(resolveStepMeta({ progress: -0.1 }).progress).toBeUndefined();
    expect(resolveStepMeta({ progress: 1.1 }).progress).toBeUndefined();
  });

  it('rejects wrong types for well-known keys', () => {
    const result = resolveStepMeta({
      message: 42,
      progress: 'half',
      mediaType: true,
      mediaUri: null,
      skipReason: undefined,
      error: {},
    });
    expect(result.message).toBeUndefined();
    expect(result.progress).toBeUndefined();
    expect(result.mediaType).toBeUndefined();
    expect(result.mediaUri).toBeUndefined();
    expect(result.skipReason).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('ignores empty strings for string keys', () => {
    const result = resolveStepMeta({
      message: '',
      skipReason: '',
    });
    expect(result.message).toBeUndefined();
    expect(result.skipReason).toBeUndefined();
  });

  it('preserves unknown keys on the original meta (not extracted)', () => {
    const meta = {
      message: 'Hello',
      'x-custom-key': { nested: true },
      'x-batch-id': 'abc-123',
    };
    const result = resolveStepMeta(meta);
    expect(result.message).toBe('Hello');
    // Unknown keys are NOT in the result — they stay on the original meta
    expect((result as any)['x-custom-key']).toBeUndefined();
  });
});

describe('applyStatusMap', () => {
  const steps: FlowProgressStep[] = [
    { id: '1', label: 'Build', status: 'pending' },
    { id: '2', label: 'Test', status: 'active' },
    { id: '3', label: 'Deploy', status: 'complete' },
  ];

  it('returns original array when no statusMap provided', () => {
    const result = applyStatusMap(steps, undefined);
    expect(result).toBe(steps); // Same reference
  });

  it('passes through built-in statuses unchanged', () => {
    const statusMap = { queued: 'pending' as const };
    const result = applyStatusMap(steps, statusMap);
    expect(result[0].status).toBe('pending');
    expect(result[1].status).toBe('active');
    expect(result[2].status).toBe('complete');
  });

  it('maps custom statuses to built-in values', () => {
    const customSteps: FlowProgressStep[] = [
      { id: '1', label: 'Build', status: 'queued' as any },
      { id: '2', label: 'Test', status: 'building' as any },
      { id: '3', label: 'Deploy', status: 'deployed' as any },
    ];
    const statusMap = {
      queued: 'pending' as const,
      building: 'active' as const,
      deployed: 'complete' as const,
    };
    const result = applyStatusMap(customSteps, statusMap);
    expect(result[0].status).toBe('pending');
    expect(result[1].status).toBe('active');
    expect(result[2].status).toBe('complete');
  });

  it('falls back to pending for unknown custom statuses', () => {
    const customSteps: FlowProgressStep[] = [
      { id: '1', label: 'Build', status: 'unknown_status' as any },
    ];
    const result = applyStatusMap(customSteps, {});
    expect(result[0].status).toBe('pending');
  });

  it('maps to skipped status', () => {
    const customSteps: FlowProgressStep[] = [
      { id: '1', label: 'Build', status: 'cancelled' as any },
    ];
    const result = applyStatusMap(customSteps, { cancelled: 'skipped' });
    expect(result[0].status).toBe('skipped');
  });

  it('does not mutate original steps', () => {
    const customSteps: FlowProgressStep[] = [
      { id: '1', label: 'Build', status: 'queued' as any },
    ];
    const original = { ...customSteps[0] };
    applyStatusMap(customSteps, { queued: 'active' });
    expect(customSteps[0].status).toBe('queued'); // unchanged
    expect(customSteps[0]).toEqual(original);
  });

  it('preserves meta and other fields during mapping', () => {
    const customSteps: FlowProgressStep[] = [
      { id: '1', label: 'Build', status: 'queued' as any, type: 'custom', meta: { message: 'test' } },
    ];
    const result = applyStatusMap(customSteps, { queued: 'active' });
    expect(result[0].status).toBe('active');
    expect(result[0].type).toBe('custom');
    expect(result[0].meta).toEqual({ message: 'test' });
  });

  it('handles mixed built-in and custom statuses', () => {
    const mixedSteps: FlowProgressStep[] = [
      { id: '1', label: 'A', status: 'complete' },
      { id: '2', label: 'B', status: 'in_progress' as any },
      { id: '3', label: 'C', status: 'error' },
      { id: '4', label: 'D', status: 'not_started' as any },
    ];
    const result = applyStatusMap(mixedSteps, {
      in_progress: 'active',
      not_started: 'pending',
    });
    expect(result[0].status).toBe('complete');
    expect(result[1].status).toBe('active');
    expect(result[2].status).toBe('error');
    expect(result[3].status).toBe('pending');
  });
});

describe('resolveStepBg with skipped status', () => {
  const theme = DEFAULT_FLOW_PROGRESS_THEME;

  it('returns skippedColor for skipped steps', () => {
    const step: FlowProgressStep = { id: '1', label: 'Test', status: 'skipped' };
    expect(resolveStepBg(step, theme)).toBe(theme.skippedColor);
  });

  it('skipped steps do NOT use per-type colors', () => {
    const step: FlowProgressStep = { id: '1', label: 'Test', status: 'skipped', type: 'ai.summarize' };
    expect(resolveStepBg(step, theme)).toBe(theme.skippedColor);
    expect(resolveStepBg(step, theme)).not.toBe(theme.stepColors['ai.summarize']);
  });
});

describe('resolveStepTextColor with skipped status', () => {
  const theme = DEFAULT_FLOW_PROGRESS_THEME;

  it('returns skippedTextColor with line-through for skipped steps', () => {
    const step: FlowProgressStep = { id: '1', label: 'Test', status: 'skipped' };
    const result = resolveStepTextColor(step, theme, false);
    expect(result).toContain(theme.skippedTextColor);
    expect(result).toContain('line-through');
  });
});

describe('resolveConnectorColor with skipped status', () => {
  const theme = DEFAULT_FLOW_PROGRESS_THEME;

  it('returns pendingColor for skipped steps (not treated as complete)', () => {
    const step: FlowProgressStep = { id: '1', label: 'Test', status: 'skipped' };
    expect(resolveConnectorColor(step, theme)).toBe(theme.pendingColor);
  });
});

describe('resolveAutoMode', () => {
  describe('4-tier width-based selection', () => {
    it('returns vertical for width < 480 (default compact threshold)', () => {
      expect(resolveAutoMode(0)).toBe('vertical');
      expect(resolveAutoMode(200)).toBe('vertical');
      expect(resolveAutoMode(479)).toBe('vertical');
    });

    it('returns compact for width between compact and expanded thresholds', () => {
      expect(resolveAutoMode(480)).toBe('compact');
      expect(resolveAutoMode(560)).toBe('compact');
      expect(resolveAutoMode(639)).toBe('compact');
    });

    it('returns expanded for width between expanded and full thresholds', () => {
      expect(resolveAutoMode(640)).toBe('expanded');
      expect(resolveAutoMode(750)).toBe('expanded');
      expect(resolveAutoMode(899)).toBe('expanded');
    });

    it('returns full for width >= full threshold', () => {
      expect(resolveAutoMode(900)).toBe('full');
      expect(resolveAutoMode(1200)).toBe('full');
      expect(resolveAutoMode(1920)).toBe('full');
    });
  });

  describe('parallel thread awareness', () => {
    it('returns compact instead of vertical when parallel threads exist', () => {
      expect(resolveAutoMode(300, { hasParallelThreads: true })).toBe('compact');
      expect(resolveAutoMode(0, { hasParallelThreads: true })).toBe('compact');
      expect(resolveAutoMode(479, { hasParallelThreads: true })).toBe('compact');
    });

    it('does not affect modes above compact threshold when threads exist', () => {
      expect(resolveAutoMode(640, { hasParallelThreads: true })).toBe('expanded');
      expect(resolveAutoMode(900, { hasParallelThreads: true })).toBe('full');
    });
  });

  describe('pipeline auto-detection', () => {
    it('returns pipeline when pipelineConfig is present and width >= expanded', () => {
      expect(resolveAutoMode(640, { hasPipelineConfig: true })).toBe('pipeline');
      expect(resolveAutoMode(900, { hasPipelineConfig: true })).toBe('pipeline');
      expect(resolveAutoMode(1200, { hasPipelineConfig: true })).toBe('pipeline');
    });

    it('does not return pipeline when width is below expanded threshold', () => {
      expect(resolveAutoMode(480, { hasPipelineConfig: true })).toBe('compact');
      expect(resolveAutoMode(300, { hasPipelineConfig: true })).toBe('vertical');
    });

    it('does not return pipeline when parallel threads exist', () => {
      expect(resolveAutoMode(900, {
        hasPipelineConfig: true,
        hasParallelThreads: true,
      })).toBe('full');
    });

    it('does not return pipeline when both threads and pipeline config exist', () => {
      expect(resolveAutoMode(640, {
        hasPipelineConfig: true,
        hasParallelThreads: true,
      })).toBe('expanded');
    });
  });

  describe('custom breakpoints', () => {
    it('respects custom compact breakpoint', () => {
      const bp = { compact: 320 };
      expect(resolveAutoMode(300, { breakpoints: bp })).toBe('vertical');
      expect(resolveAutoMode(320, { breakpoints: bp })).toBe('compact');
    });

    it('respects custom expanded breakpoint', () => {
      const bp = { expanded: 500 };
      expect(resolveAutoMode(499, { breakpoints: bp })).toBe('compact');
      expect(resolveAutoMode(500, { breakpoints: bp })).toBe('expanded');
    });

    it('respects custom full breakpoint', () => {
      const bp = { full: 1000 };
      expect(resolveAutoMode(999, { breakpoints: bp })).toBe('expanded');
      expect(resolveAutoMode(1000, { breakpoints: bp })).toBe('full');
    });

    it('supports all custom breakpoints together', () => {
      const bp = { compact: 300, expanded: 500, full: 800 };
      expect(resolveAutoMode(200, { breakpoints: bp })).toBe('vertical');
      expect(resolveAutoMode(400, { breakpoints: bp })).toBe('compact');
      expect(resolveAutoMode(600, { breakpoints: bp })).toBe('expanded');
      expect(resolveAutoMode(900, { breakpoints: bp })).toBe('full');
    });
  });

  describe('DEFAULT_AUTO_BREAKPOINTS', () => {
    it('has expected default values', () => {
      expect(DEFAULT_AUTO_BREAKPOINTS.compact).toBe(480);
      expect(DEFAULT_AUTO_BREAKPOINTS.expanded).toBe(640);
      expect(DEFAULT_AUTO_BREAKPOINTS.full).toBe(900);
    });
  });
});

describe('getStatusIcon', () => {
  it('returns a node for each status', () => {
    expect(getStatusIcon('complete', 16)).toBeTruthy();
    expect(getStatusIcon('active', 16)).toBeTruthy();
    expect(getStatusIcon('error', 16)).toBeTruthy();
    expect(getStatusIcon('skipped', 16)).toBeTruthy();
    expect(getStatusIcon('pending', 16)).toBeTruthy();
  });

  it('uses typeIcon for active status when provided', () => {
    const customIcon = 'custom-icon';
    expect(getStatusIcon('active', 16, customIcon)).toBe(customIcon);
  });

  it('uses typeIcon for pending status when provided', () => {
    const customIcon = 'custom-icon';
    expect(getStatusIcon('pending', 16, customIcon)).toBe(customIcon);
  });

  it('ignores typeIcon for complete/error/skipped statuses', () => {
    const customIcon = 'custom-icon';
    expect(getStatusIcon('complete', 16, customIcon)).not.toBe(customIcon);
    expect(getStatusIcon('error', 16, customIcon)).not.toBe(customIcon);
    expect(getStatusIcon('skipped', 16, customIcon)).not.toBe(customIcon);
  });
});
