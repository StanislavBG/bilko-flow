/**
 * Payload size awareness and artifact transport strategy.
 *
 * When workflows chain media generation steps, artifacts (images, videos)
 * can grow significantly. Sending a 15-20MB base64 video in an HTTP body
 * can exceed server limits (e.g. Express's default 10MB).
 *
 * This module provides:
 *   - ArtifactTransport enum: inline, reference, or streaming strategies.
 *   - Automatic strategy selection based on artifact size.
 *   - Size tracking on StepExecution via outputSizeBytes.
 *   - Payload growth warnings when artifact chaining creates large payloads.
 */

/**
 * Transport strategy for moving artifacts between steps.
 *
 * - inline:    Base64-encode into the HTTP body. Fast for small artifacts (<5MB).
 * - reference: Store in object storage, pass a URI pointer. Required for >=5MB.
 * - streaming: Stream content directly. Best for very large artifacts or live data.
 */
export enum ArtifactTransport {
  /** Embed base64 in payload. Best for artifacts < 5MB. */
  Inline = 'inline',
  /** Store externally, pass URI reference. Best for artifacts >= 5MB. */
  Reference = 'reference',
  /** Stream content without full buffering. Best for very large artifacts. */
  Streaming = 'streaming',
}

/** Size thresholds for automatic transport strategy selection. */
export interface TransportThresholds {
  /** Maximum size in bytes for inline transport. Default: 5MB. */
  inlineMaxBytes: number;
  /** Maximum size in bytes for reference transport. Default: 500MB. Above this, use streaming. */
  referenceMaxBytes: number;
}

/** Default thresholds. */
export const DEFAULT_TRANSPORT_THRESHOLDS: Readonly<TransportThresholds> = {
  inlineMaxBytes: 5 * 1024 * 1024,       // 5MB
  referenceMaxBytes: 500 * 1024 * 1024,   // 500MB
};

/**
 * Select the appropriate transport strategy based on artifact size.
 *
 * @param sizeBytes - The artifact size in bytes.
 * @param thresholds - Optional custom thresholds.
 * @returns The recommended transport strategy.
 */
export function selectTransportStrategy(
  sizeBytes: number,
  thresholds: TransportThresholds = DEFAULT_TRANSPORT_THRESHOLDS,
): ArtifactTransport {
  if (sizeBytes <= thresholds.inlineMaxBytes) {
    return ArtifactTransport.Inline;
  }
  if (sizeBytes <= thresholds.referenceMaxBytes) {
    return ArtifactTransport.Reference;
  }
  return ArtifactTransport.Streaming;
}

/** Metadata about an artifact's transport characteristics. */
export interface ArtifactTransportMeta {
  /** Selected transport strategy. */
  transport: ArtifactTransport;
  /** Size of the artifact in bytes. */
  sizeBytes: number;
  /** MIME type of the artifact. */
  mimeType?: string;
  /** URI for reference/streaming transport. */
  uri?: string;
  /** Content hash for integrity verification. */
  contentHash?: string;
}

/**
 * Payload growth tracker for artifact-chaining workflows.
 *
 * Tracks cumulative payload sizes across steps and emits warnings
 * when the total exceeds safe thresholds for the chosen transport.
 */
export class PayloadGrowthTracker {
  private stepSizes: Map<string, number> = new Map();
  private warnings: PayloadWarning[] = [];

  /** Warn threshold: cumulative payload at which warnings are emitted. Default: 10MB. */
  readonly warnThresholdBytes: number;
  /** Hard limit: cumulative payload at which transport must switch to reference. Default: 50MB. */
  readonly hardLimitBytes: number;

  constructor(
    warnThresholdBytes: number = 10 * 1024 * 1024,
    hardLimitBytes: number = 50 * 1024 * 1024,
  ) {
    this.warnThresholdBytes = warnThresholdBytes;
    this.hardLimitBytes = hardLimitBytes;
  }

  /**
   * Record the output size of a step execution.
   *
   * @param stepId - The step that produced the output.
   * @param sizeBytes - Size of the step's output in bytes.
   * @returns Transport metadata with strategy recommendation.
   */
  recordStepOutput(stepId: string, sizeBytes: number): ArtifactTransportMeta {
    this.stepSizes.set(stepId, sizeBytes);

    const cumulative = this.cumulativeBytes;
    const transport = selectTransportStrategy(sizeBytes);

    if (cumulative > this.hardLimitBytes) {
      this.warnings.push({
        stepId,
        level: 'error',
        message: `Cumulative payload (${formatBytes(cumulative)}) exceeds hard limit (${formatBytes(this.hardLimitBytes)}). Switch to reference transport.`,
        cumulativeBytes: cumulative,
        stepBytes: sizeBytes,
      });
    } else if (cumulative > this.warnThresholdBytes) {
      this.warnings.push({
        stepId,
        level: 'warning',
        message: `Cumulative payload (${formatBytes(cumulative)}) exceeds warn threshold (${formatBytes(this.warnThresholdBytes)}). Consider reference transport for large artifacts.`,
        cumulativeBytes: cumulative,
        stepBytes: sizeBytes,
      });
    }

    return {
      transport,
      sizeBytes,
    };
  }

  /** Get the cumulative payload size across all recorded steps. */
  get cumulativeBytes(): number {
    let total = 0;
    for (const size of this.stepSizes.values()) {
      total += size;
    }
    return total;
  }

  /** Get any payload growth warnings emitted so far. */
  getWarnings(): readonly PayloadWarning[] {
    return this.warnings;
  }

  /** Check whether the cumulative payload exceeds the hard limit. */
  get exceedsHardLimit(): boolean {
    return this.cumulativeBytes > this.hardLimitBytes;
  }

  /** Reset tracking state. */
  reset(): void {
    this.stepSizes.clear();
    this.warnings = [];
  }
}

/** A payload growth warning. */
export interface PayloadWarning {
  stepId: string;
  level: 'warning' | 'error';
  message: string;
  cumulativeBytes: number;
  stepBytes: number;
}

/** Format bytes into a human-readable string. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}
