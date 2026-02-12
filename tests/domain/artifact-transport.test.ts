import {
  ArtifactTransport,
  DEFAULT_TRANSPORT_THRESHOLDS,
  selectTransportStrategy,
  PayloadGrowthTracker,
} from '../../src/domain/artifact-transport';

describe('selectTransportStrategy', () => {
  it('selects inline for small payloads', () => {
    expect(selectTransportStrategy(1024)).toBe(ArtifactTransport.Inline); // 1KB
    expect(selectTransportStrategy(4 * 1024 * 1024)).toBe(ArtifactTransport.Inline); // 4MB
  });

  it('selects inline at the exact threshold', () => {
    expect(selectTransportStrategy(DEFAULT_TRANSPORT_THRESHOLDS.inlineMaxBytes))
      .toBe(ArtifactTransport.Inline);
  });

  it('selects reference for medium payloads', () => {
    expect(selectTransportStrategy(10 * 1024 * 1024)).toBe(ArtifactTransport.Reference); // 10MB
    expect(selectTransportStrategy(100 * 1024 * 1024)).toBe(ArtifactTransport.Reference); // 100MB
  });

  it('selects streaming for very large payloads', () => {
    expect(selectTransportStrategy(600 * 1024 * 1024)).toBe(ArtifactTransport.Streaming); // 600MB
  });

  it('respects custom thresholds', () => {
    const custom = { inlineMaxBytes: 1024, referenceMaxBytes: 10240 };
    expect(selectTransportStrategy(512, custom)).toBe(ArtifactTransport.Inline);
    expect(selectTransportStrategy(5000, custom)).toBe(ArtifactTransport.Reference);
    expect(selectTransportStrategy(20000, custom)).toBe(ArtifactTransport.Streaming);
  });
});

describe('PayloadGrowthTracker', () => {
  it('tracks cumulative payload size', () => {
    const tracker = new PayloadGrowthTracker();
    tracker.recordStepOutput('step-1', 1000);
    tracker.recordStepOutput('step-2', 2000);
    expect(tracker.cumulativeBytes).toBe(3000);
  });

  it('emits warning when warn threshold is exceeded', () => {
    const tracker = new PayloadGrowthTracker(100, 1000); // low thresholds for testing
    tracker.recordStepOutput('step-1', 50);
    expect(tracker.getWarnings()).toHaveLength(0);

    tracker.recordStepOutput('step-2', 60); // cumulative = 110 > 100
    expect(tracker.getWarnings()).toHaveLength(1);
    expect(tracker.getWarnings()[0].level).toBe('warning');
    expect(tracker.getWarnings()[0].stepId).toBe('step-2');
  });

  it('emits error when hard limit is exceeded', () => {
    const tracker = new PayloadGrowthTracker(100, 200);
    tracker.recordStepOutput('step-1', 150);
    tracker.recordStepOutput('step-2', 60); // cumulative = 210 > 200

    const errors = tracker.getWarnings().filter(w => w.level === 'error');
    expect(errors).toHaveLength(1);
    expect(tracker.exceedsHardLimit).toBe(true);
  });

  it('returns transport strategy for each step', () => {
    const tracker = new PayloadGrowthTracker();
    const meta = tracker.recordStepOutput('step-1', 1024);
    expect(meta.transport).toBe(ArtifactTransport.Inline);
    expect(meta.sizeBytes).toBe(1024);

    const meta2 = tracker.recordStepOutput('step-2', 10 * 1024 * 1024);
    expect(meta2.transport).toBe(ArtifactTransport.Reference);
  });

  it('resets tracking state', () => {
    const tracker = new PayloadGrowthTracker(100, 200);
    tracker.recordStepOutput('step-1', 150);
    expect(tracker.cumulativeBytes).toBe(150);

    tracker.reset();
    expect(tracker.cumulativeBytes).toBe(0);
    expect(tracker.getWarnings()).toHaveLength(0);
  });
});
