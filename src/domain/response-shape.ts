/**
 * Response shape logging utilities.
 *
 * When API response parsing fails unexpectedly, the lack of structural
 * metadata about the raw response makes diagnosis difficult. This module
 * captures the structural "shape" of an API response (top-level keys,
 * types, array lengths) without recording actual data values.
 *
 * The captured shape is stored as `rawResponseShape` on StepExecution,
 * providing a diagnostic breadcrumb when parsing fails.
 */

/**
 * Structural descriptor for a single field in a response.
 * Records the key name and JS typeof, plus array length if applicable.
 * Never records actual values.
 */
export interface ResponseFieldShape {
  /** The key name in the response object. */
  key: string;
  /** The JS typeof result (string, number, boolean, object, etc.). */
  type: string;
  /** If the field is an array, its length. */
  arrayLength?: number;
  /** If the field is an object, its top-level keys (one level deep). */
  nestedKeys?: string[];
  /** Whether the field value is null. */
  isNull: boolean;
}

/**
 * Structural shape of an API response.
 * Captures metadata about the response structure without actual data.
 */
export interface RawResponseShape {
  /** Top-level fields and their structural descriptors. */
  fields: ResponseFieldShape[];
  /** Total number of top-level keys. */
  topLevelKeyCount: number;
  /** Whether the root value is an array (vs. object). */
  isArray: boolean;
  /** If root is an array, its length. */
  rootArrayLength?: number;
  /** Timestamp when the shape was captured. */
  capturedAt: string;
  /** Optional label identifying the API or operation. */
  source?: string;
}

/**
 * Capture the structural shape of a response value.
 *
 * This function inspects the top-level structure of a response
 * and records field names, types, and structural metadata. It
 * NEVER records actual data values — only structural information.
 *
 * Should be called BEFORE any parsing/handling logic so the raw
 * structure is available for diagnostics if parsing fails.
 *
 * @param response - The raw API response (typically parsed JSON).
 * @param source - Optional label identifying the API or operation.
 * @returns The structural shape descriptor.
 */
export function captureResponseShape(
  response: unknown,
  source?: string,
): RawResponseShape {
  const capturedAt = new Date().toISOString();

  if (response === null || response === undefined) {
    return {
      fields: [],
      topLevelKeyCount: 0,
      isArray: false,
      capturedAt,
      source,
    };
  }

  if (Array.isArray(response)) {
    return {
      fields: describeArrayElements(response),
      topLevelKeyCount: 0,
      isArray: true,
      rootArrayLength: response.length,
      capturedAt,
      source,
    };
  }

  if (typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    const keys = Object.keys(obj);
    const fields = keys.map((key) => describeField(key, obj[key]));

    return {
      fields,
      topLevelKeyCount: keys.length,
      isArray: false,
      capturedAt,
      source,
    };
  }

  // Primitive value at root
  return {
    fields: [{
      key: '(root)',
      type: typeof response,
      isNull: false,
    }],
    topLevelKeyCount: 0,
    isArray: false,
    capturedAt,
    source,
  };
}

/**
 * Describe the structural shape of array elements.
 * Returns a shape descriptor for the first few elements (max 3)
 * to avoid excessive logging for large arrays.
 */
function describeArrayElements(arr: unknown[]): ResponseFieldShape[] {
  const maxSample = Math.min(arr.length, 3);
  const fields: ResponseFieldShape[] = [];

  for (let i = 0; i < maxSample; i++) {
    fields.push(describeField(`[${i}]`, arr[i]));
  }

  return fields;
}

/**
 * Describe a single field's structural shape.
 * Records type information but never actual values.
 */
function describeField(key: string, value: unknown): ResponseFieldShape {
  if (value === null) {
    return { key, type: 'null', isNull: true };
  }

  if (value === undefined) {
    return { key, type: 'undefined', isNull: true };
  }

  if (Array.isArray(value)) {
    return {
      key,
      type: 'array',
      arrayLength: value.length,
      isNull: false,
    };
  }

  if (typeof value === 'object') {
    const objKeys = Object.keys(value as Record<string, unknown>);
    return {
      key,
      type: 'object',
      nestedKeys: objKeys.slice(0, 20), // Cap at 20 keys to avoid log bloat
      isNull: false,
    };
  }

  return {
    key,
    type: typeof value,
    isNull: false,
  };
}

/**
 * Format a RawResponseShape as a compact diagnostic string.
 * Useful for logging without structured log support.
 */
export function formatResponseShape(shape: RawResponseShape): string {
  const lines: string[] = [];

  if (shape.source) {
    lines.push(`Source: ${shape.source}`);
  }

  if (shape.isArray) {
    lines.push(`Root: Array[${shape.rootArrayLength}]`);
  } else {
    lines.push(`Root: Object (${shape.topLevelKeyCount} keys)`);
  }

  for (const field of shape.fields) {
    let desc = `  ${field.key}: ${field.type}`;
    if (field.arrayLength !== undefined) {
      desc += `[${field.arrayLength}]`;
    }
    if (field.nestedKeys) {
      desc += ` {${field.nestedKeys.join(', ')}}`;
    }
    if (field.isNull) {
      desc += ' (null)';
    }
    lines.push(desc);
  }

  return lines.join('\n');
}
