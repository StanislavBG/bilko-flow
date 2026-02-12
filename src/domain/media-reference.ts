/**
 * Media reference resolution utilities.
 *
 * API responses for media generation (video, image) often return
 * download URIs or reference pointers rather than inline content.
 * This module provides a two-phase contract:
 *   1. Detect whether a response value is a URI reference or inline data.
 *   2. Resolve references to actual bytes with authentication, MIME
 *      validation, and resolution path logging.
 */

/** Describes the kind of media reference returned by an API. */
export type MediaReferenceKind = 'uri' | 'inline-base64' | 'inline-binary';

/** A resolved media reference with validated content. */
export interface ResolvedMedia {
  /** Original reference kind before resolution. */
  kind: MediaReferenceKind;
  /** The raw bytes of the resolved media content. */
  data: Buffer;
  /** Validated MIME type (e.g. 'video/mp4', 'image/png'). */
  mimeType: string;
  /** Size of the resolved content in bytes. */
  sizeBytes: number;
  /** The URI that was fetched, if kind was 'uri'. */
  sourceUri?: string;
  /** How long the resolution took in milliseconds. */
  resolutionMs: number;
}

/** Options for resolving a media reference. */
export interface ResolveMediaOptions {
  /** Authorization header value for fetching URI references. */
  authHeader?: string;
  /** Maximum allowed content size in bytes. Defaults to 100MB. */
  maxSizeBytes?: number;
  /** Allowed MIME types. If provided, rejects content with other types. */
  allowedMimeTypes?: string[];
  /** Timeout for HTTP fetch in milliseconds. Defaults to 120_000 (2 min). */
  fetchTimeoutMs?: number;
}

/** Default maximum content size: 100MB. */
const DEFAULT_MAX_SIZE_BYTES = 100 * 1024 * 1024;

/** Default fetch timeout: 2 minutes. */
const DEFAULT_FETCH_TIMEOUT_MS = 120_000;

/**
 * Known URI patterns that indicate a reference (not inline data).
 * Covers https, gs://, s3:// and similar cloud storage URIs.
 */
const URI_PATTERN = /^(https?:\/\/|gs:\/\/|s3:\/\/|az:\/\/)/i;

/** Common base64 data URI prefix pattern. */
const DATA_URI_PATTERN = /^data:([^;]+);base64,/;

/**
 * Detect the kind of media reference from a raw API response value.
 *
 * @param value - The raw value from the API response (string or Buffer).
 * @returns The detected reference kind.
 */
export function detectMediaReferenceKind(value: unknown): MediaReferenceKind {
  if (Buffer.isBuffer(value)) {
    return 'inline-binary';
  }
  if (typeof value === 'string') {
    if (URI_PATTERN.test(value)) {
      return 'uri';
    }
    if (DATA_URI_PATTERN.test(value)) {
      return 'inline-base64';
    }
    // If it looks like raw base64 (long string, no whitespace, valid chars)
    if (value.length > 256 && /^[A-Za-z0-9+/=\r\n]+$/.test(value)) {
      return 'inline-base64';
    }
    // If it starts with http-like patterns
    if (URI_PATTERN.test(value.trim())) {
      return 'uri';
    }
  }
  return 'inline-base64';
}

/**
 * Resolve a media reference to actual bytes.
 *
 * For URI references, fetches the content with optional authentication.
 * For inline data, decodes base64 or passes through binary.
 * Validates MIME type and content size in all cases.
 *
 * @param value - The raw API response value (URI string, base64 string, or Buffer).
 * @param options - Resolution options (auth, size limits, allowed MIME types).
 * @returns Resolved media with validated content.
 * @throws {MediaResolutionError} If resolution fails.
 */
export async function resolveMediaReference(
  value: unknown,
  options: ResolveMediaOptions = {},
): Promise<ResolvedMedia> {
  const startTime = Date.now();
  const maxSize = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const kind = detectMediaReferenceKind(value);

  let data: Buffer;
  let mimeType: string;
  let sourceUri: string | undefined;

  switch (kind) {
    case 'uri': {
      const uri = (value as string).trim();
      sourceUri = uri;
      const result = await fetchMediaFromUri(uri, options);
      data = result.data;
      mimeType = result.mimeType;
      break;
    }

    case 'inline-base64': {
      const str = value as string;
      const dataUriMatch = str.match(DATA_URI_PATTERN);
      if (dataUriMatch) {
        mimeType = dataUriMatch[1];
        const base64Part = str.slice(dataUriMatch[0].length);
        data = Buffer.from(base64Part, 'base64');
      } else {
        mimeType = inferMimeTypeFromBase64(str);
        data = Buffer.from(str, 'base64');
      }
      break;
    }

    case 'inline-binary': {
      data = value as Buffer;
      mimeType = inferMimeTypeFromBuffer(data);
      break;
    }
  }

  // Validate size
  if (data.length > maxSize) {
    throw new MediaResolutionError(
      `Resolved media exceeds maximum size: ${data.length} bytes > ${maxSize} bytes`,
      'SIZE_EXCEEDED',
      { sizeBytes: data.length, maxSizeBytes: maxSize },
    );
  }

  // Validate MIME type
  if (options.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
    if (!options.allowedMimeTypes.includes(mimeType)) {
      throw new MediaResolutionError(
        `MIME type "${mimeType}" not in allowed types: ${options.allowedMimeTypes.join(', ')}`,
        'INVALID_MIME_TYPE',
        { mimeType, allowedMimeTypes: options.allowedMimeTypes },
      );
    }
  }

  return {
    kind,
    data,
    mimeType,
    sizeBytes: data.length,
    sourceUri,
    resolutionMs: Date.now() - startTime,
  };
}

/**
 * Fetch media content from a URI with optional authentication.
 * Internal helper — not exported.
 */
async function fetchMediaFromUri(
  uri: string,
  options: ResolveMediaOptions,
): Promise<{ data: Buffer; mimeType: string }> {
  const timeout = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const headers: Record<string, string> = {};
  if (options.authHeader) {
    headers['Authorization'] = options.authHeader;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(uri, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new MediaResolutionError(
        `Failed to fetch media from URI: HTTP ${response.status} ${response.statusText}`,
        'FETCH_FAILED',
        { uri, statusCode: response.status },
      );
    }

    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    const mimeType = contentType.split(';')[0].trim();
    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer);

    return { data, mimeType };
  } catch (err) {
    if (err instanceof MediaResolutionError) throw err;
    const message = err instanceof Error ? err.message : 'Unknown fetch error';
    throw new MediaResolutionError(
      `Failed to fetch media from URI: ${message}`,
      'FETCH_FAILED',
      { uri },
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Infer MIME type from the first bytes of a buffer (magic bytes). */
function inferMimeTypeFromBuffer(buf: Buffer): string {
  if (buf.length < 4) return 'application/octet-stream';

  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return 'image/gif';
  }
  // WebP
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  // MP4 (ftyp box)
  if (buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') {
    return 'video/mp4';
  }
  // WebM
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return 'video/webm';
  }

  return 'application/octet-stream';
}

/** Infer MIME type from base64 content by decoding first bytes. */
function inferMimeTypeFromBase64(base64: string): string {
  try {
    const sample = Buffer.from(base64.slice(0, 64), 'base64');
    return inferMimeTypeFromBuffer(sample);
  } catch {
    return 'application/octet-stream';
  }
}

/**
 * Error thrown when media reference resolution fails.
 * Carries a machine-readable code and structured details.
 */
export class MediaResolutionError extends Error {
  public readonly errorCode: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, errorCode: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'MediaResolutionError';
    this.errorCode = errorCode;
    this.details = details;
  }
}
