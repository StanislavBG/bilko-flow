/**
 * First-class media generation contracts.
 *
 * Video/image generation has fundamentally different execution
 * profiles than text generation: longer durations, reference-based
 * transport, partial success support, and higher cost tiers.
 *
 * This module provides the MediaGenerationContract interface that
 * declares the execution characteristics of a media generation step,
 * enabling the engine to apply appropriate timeout budgets, transport
 * strategies, and error handling.
 */

import { ArtifactTransport } from './artifact-transport';
import { AsyncPollingConfig, ASYNC_POLLING_PRESETS } from './async-polling';

/**
 * Duration range for a media generation operation.
 * Expressed in minutes (not seconds) to reflect the reality
 * that video generation typically takes 3-8 minutes.
 */
export interface DurationRange {
  /** Minimum expected duration in minutes. */
  minMinutes: number;
  /** Maximum expected duration in minutes. */
  maxMinutes: number;
}

/**
 * Cost tier classification for media generation.
 * Used for resource allocation, quota enforcement, and billing.
 */
export type CostTier = 'low' | 'medium' | 'high' | 'very-high';

/**
 * Input field requirement for a media generation step.
 * Declares which fields are expected and their constraints.
 */
export interface MediaInputField {
  /** Field name in the step inputs. */
  name: string;
  /** Whether this field is required. */
  required: boolean;
  /** Human-readable description. */
  description: string;
  /** Maximum size in bytes for binary/media input fields. */
  maxSizeBytes?: number;
}

/**
 * Describes whether a media generation step can produce
 * partial results (e.g., 3 of 5 video clips generated).
 */
export interface PartialSuccessPolicy {
  /** Whether partial success is supported. */
  supported: boolean;
  /** Minimum number/percentage of outputs required for partial success. */
  minOutputs?: number;
  /** How to handle partial results: 'accept' the partial set, or 'fail' the step. */
  partialBehavior: 'accept' | 'fail';
}

/**
 * Describes whether the output of this step can be chained
 * as input to another step (artifact chaining).
 */
export interface ChainabilitySpec {
  /** Whether this step's output can be chained as input to subsequent steps. */
  chainable: boolean;
  /** MIME types this step produces. */
  outputMimeTypes: string[];
  /** MIME types this step accepts as chained input (for scene extension, etc.). */
  inputMimeTypes?: string[];
  /** Whether chaining produces payload growth that needs size tracking. */
  producesPayloadGrowth: boolean;
}

/**
 * First-class contract for media generation steps.
 *
 * Declares the execution characteristics that differ from text
 * generation, allowing the engine to adapt its behavior:
 *
 * - Duration: minutes, not seconds
 * - Transport: reference or streaming, not inline
 * - Partial success: may produce some outputs even if not all succeed
 * - Chainability: outputs may be inputs to subsequent media steps
 * - Cost: higher resource consumption than text generation
 */
export interface MediaGenerationContract {
  /** Unique identifier for this contract (e.g., 'veo-video-generation'). */
  id: string;
  /** Human-readable name (e.g., 'Veo Video Generation'). */
  name: string;
  /** Media type this contract covers. */
  mediaType: 'video' | 'image' | 'audio';
  /** Expected duration range. */
  duration: DurationRange;
  /** Recommended transport strategy for outputs. */
  transport: ArtifactTransport;
  /** Async polling configuration for this media type. */
  pollingConfig: AsyncPollingConfig;
  /** Partial success policy. */
  partialSuccess: PartialSuccessPolicy;
  /** Chainability specification. */
  chainability: ChainabilitySpec;
  /** Required and optional input fields. */
  inputFields: MediaInputField[];
  /** Cost tier for resource allocation. */
  costTier: CostTier;
}

/**
 * Built-in contract for video generation via Google Veo.
 * Tuned for the observed 3-8 minute generation times.
 */
export const VEO_VIDEO_CONTRACT: MediaGenerationContract = {
  id: 'veo-video-generation',
  name: 'Veo Video Generation',
  mediaType: 'video',
  duration: { minMinutes: 3, maxMinutes: 8 },
  transport: ArtifactTransport.Reference,
  pollingConfig: {
    ...ASYNC_POLLING_PRESETS.standard,
  },
  partialSuccess: {
    supported: true,
    minOutputs: 1,
    partialBehavior: 'accept',
  },
  chainability: {
    chainable: true,
    outputMimeTypes: ['video/mp4'],
    inputMimeTypes: ['video/mp4'],
    producesPayloadGrowth: true,
  },
  inputFields: [
    { name: 'prompt', required: true, description: 'Text prompt describing the video scene' },
    { name: 'duration', required: false, description: 'Desired video duration in seconds' },
    { name: 'aspectRatio', required: false, description: 'Aspect ratio (e.g., 16:9, 9:16)' },
    { name: 'referenceVideo', required: false, description: 'Reference video for scene extension', maxSizeBytes: 50 * 1024 * 1024 },
  ],
  costTier: 'very-high',
};

/**
 * Built-in contract for image generation (DALL-E, Imagen, etc.).
 * Shorter durations and smaller outputs than video.
 */
export const IMAGE_GENERATION_CONTRACT: MediaGenerationContract = {
  id: 'image-generation',
  name: 'Image Generation',
  mediaType: 'image',
  duration: { minMinutes: 0.1, maxMinutes: 2 },
  transport: ArtifactTransport.Reference,
  pollingConfig: {
    ...ASYNC_POLLING_PRESETS.fast,
  },
  partialSuccess: {
    supported: true,
    minOutputs: 1,
    partialBehavior: 'accept',
  },
  chainability: {
    chainable: true,
    outputMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    inputMimeTypes: ['image/png', 'image/jpeg'],
    producesPayloadGrowth: false,
  },
  inputFields: [
    { name: 'prompt', required: true, description: 'Text prompt describing the image' },
    { name: 'width', required: false, description: 'Image width in pixels' },
    { name: 'height', required: false, description: 'Image height in pixels' },
    { name: 'referenceImage', required: false, description: 'Reference image for editing', maxSizeBytes: 20 * 1024 * 1024 },
  ],
  costTier: 'high',
};

/**
 * Registry of media generation contracts by step type.
 * Allows the engine to look up the correct contract for media steps.
 */
const contractRegistry = new Map<string, MediaGenerationContract>();

/** Register a media generation contract for a step type. */
export function registerMediaContract(stepType: string, contract: MediaGenerationContract): void {
  contractRegistry.set(stepType, contract);
}

/** Look up the media generation contract for a step type. Returns undefined for non-media steps. */
export function getMediaContract(stepType: string): MediaGenerationContract | undefined {
  return contractRegistry.get(stepType);
}

/** Check whether a step type has a registered media generation contract. */
export function isMediaStep(stepType: string): boolean {
  return contractRegistry.has(stepType);
}

// Register built-in contracts
registerMediaContract('ai.generate-video', VEO_VIDEO_CONTRACT);
registerMediaContract('ai.generate-image', IMAGE_GENERATION_CONTRACT);
