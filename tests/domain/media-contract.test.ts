import {
  VEO_VIDEO_CONTRACT,
  IMAGE_GENERATION_CONTRACT,
  registerMediaContract,
  getMediaContract,
  isMediaStep,
} from '../../src/domain/media-contract';
import { ArtifactTransport } from '../../src/domain/artifact-transport';

describe('VEO_VIDEO_CONTRACT', () => {
  it('has correct media type', () => {
    expect(VEO_VIDEO_CONTRACT.mediaType).toBe('video');
  });

  it('uses reference transport for large video outputs', () => {
    expect(VEO_VIDEO_CONTRACT.transport).toBe(ArtifactTransport.Reference);
  });

  it('has duration range in minutes', () => {
    expect(VEO_VIDEO_CONTRACT.duration.minMinutes).toBeGreaterThanOrEqual(1);
    expect(VEO_VIDEO_CONTRACT.duration.maxMinutes).toBeGreaterThanOrEqual(3);
  });

  it('supports partial success', () => {
    expect(VEO_VIDEO_CONTRACT.partialSuccess.supported).toBe(true);
    expect(VEO_VIDEO_CONTRACT.partialSuccess.partialBehavior).toBe('accept');
  });

  it('is chainable with video MIME types', () => {
    expect(VEO_VIDEO_CONTRACT.chainability.chainable).toBe(true);
    expect(VEO_VIDEO_CONTRACT.chainability.outputMimeTypes).toContain('video/mp4');
    expect(VEO_VIDEO_CONTRACT.chainability.producesPayloadGrowth).toBe(true);
  });

  it('has required prompt input field', () => {
    const promptField = VEO_VIDEO_CONTRACT.inputFields.find(f => f.name === 'prompt');
    expect(promptField).toBeDefined();
    expect(promptField!.required).toBe(true);
  });

  it('is classified as very-high cost', () => {
    expect(VEO_VIDEO_CONTRACT.costTier).toBe('very-high');
  });
});

describe('IMAGE_GENERATION_CONTRACT', () => {
  it('has shorter duration range than video', () => {
    expect(IMAGE_GENERATION_CONTRACT.duration.maxMinutes).toBeLessThan(
      VEO_VIDEO_CONTRACT.duration.maxMinutes,
    );
  });

  it('has correct media type', () => {
    expect(IMAGE_GENERATION_CONTRACT.mediaType).toBe('image');
  });

  it('uses reference transport', () => {
    expect(IMAGE_GENERATION_CONTRACT.transport).toBe(ArtifactTransport.Reference);
  });
});

describe('contract registry', () => {
  it('registers and retrieves built-in video contract', () => {
    const contract = getMediaContract('ai.generate-video');
    expect(contract).toBeDefined();
    expect(contract!.id).toBe('veo-video-generation');
  });

  it('registers and retrieves built-in image contract', () => {
    const contract = getMediaContract('ai.generate-image');
    expect(contract).toBeDefined();
    expect(contract!.id).toBe('image-generation');
  });

  it('returns undefined for non-media step types', () => {
    expect(getMediaContract('transform.map')).toBeUndefined();
    expect(getMediaContract('http.search')).toBeUndefined();
  });

  it('detects media steps via isMediaStep', () => {
    expect(isMediaStep('ai.generate-video')).toBe(true);
    expect(isMediaStep('ai.generate-image')).toBe(true);
    expect(isMediaStep('ai.summarize')).toBe(false);
    expect(isMediaStep('transform.filter')).toBe(false);
  });

  it('allows registering custom contracts', () => {
    registerMediaContract('ai.generate-audio', {
      id: 'audio-generation',
      name: 'Audio Generation',
      mediaType: 'audio',
      duration: { minMinutes: 0.5, maxMinutes: 5 },
      transport: ArtifactTransport.Reference,
      pollingConfig: {
        submissionTimeoutMs: 15_000,
        pollIntervalMs: 5_000,
        pollBudgetMs: 300_000,
        downloadTimeoutMs: 60_000,
      },
      partialSuccess: { supported: false, partialBehavior: 'fail' },
      chainability: {
        chainable: false,
        outputMimeTypes: ['audio/mp3'],
        producesPayloadGrowth: false,
      },
      inputFields: [
        { name: 'prompt', required: true, description: 'Audio generation prompt' },
      ],
      costTier: 'high',
    });

    expect(isMediaStep('ai.generate-audio')).toBe(true);
    const contract = getMediaContract('ai.generate-audio');
    expect(contract!.mediaType).toBe('audio');
  });
});
