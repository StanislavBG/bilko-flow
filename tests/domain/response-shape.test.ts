import {
  captureResponseShape,
  formatResponseShape,
  RawResponseShape,
} from '../../src/domain/response-shape';

describe('captureResponseShape', () => {
  it('captures object structure without values', () => {
    const response = {
      name: 'test-video',
      status: 'SUCCEEDED',
      downloadUri: 'https://example.com/video.mp4',
      metadata: { duration: 30, resolution: '1080p' },
      clips: [{ id: 'c1' }, { id: 'c2' }],
    };

    const shape = captureResponseShape(response, 'veo-api');

    expect(shape.isArray).toBe(false);
    expect(shape.topLevelKeyCount).toBe(5);
    expect(shape.source).toBe('veo-api');
    expect(shape.capturedAt).toBeDefined();

    // Check field types — no actual values should be stored
    const nameField = shape.fields.find(f => f.key === 'name');
    expect(nameField).toBeDefined();
    expect(nameField!.type).toBe('string');
    expect(nameField!.isNull).toBe(false);

    const metadataField = shape.fields.find(f => f.key === 'metadata');
    expect(metadataField).toBeDefined();
    expect(metadataField!.type).toBe('object');
    expect(metadataField!.nestedKeys).toEqual(['duration', 'resolution']);

    const clipsField = shape.fields.find(f => f.key === 'clips');
    expect(clipsField).toBeDefined();
    expect(clipsField!.type).toBe('array');
    expect(clipsField!.arrayLength).toBe(2);
  });

  it('captures array root structure', () => {
    const response = [
      { id: '1', url: 'https://example.com/1.mp4' },
      { id: '2', url: 'https://example.com/2.mp4' },
    ];

    const shape = captureResponseShape(response);

    expect(shape.isArray).toBe(true);
    expect(shape.rootArrayLength).toBe(2);
    expect(shape.fields.length).toBeLessThanOrEqual(3); // samples max 3 elements
  });

  it('handles null response', () => {
    const shape = captureResponseShape(null);

    expect(shape.fields).toHaveLength(0);
    expect(shape.topLevelKeyCount).toBe(0);
    expect(shape.isArray).toBe(false);
  });

  it('handles undefined response', () => {
    const shape = captureResponseShape(undefined);

    expect(shape.fields).toHaveLength(0);
    expect(shape.topLevelKeyCount).toBe(0);
  });

  it('handles primitive root value', () => {
    const shape = captureResponseShape('just a string');

    expect(shape.fields).toHaveLength(1);
    expect(shape.fields[0].key).toBe('(root)');
    expect(shape.fields[0].type).toBe('string');
  });

  it('captures null field values correctly', () => {
    const response = { data: null, status: 'ok' };
    const shape = captureResponseShape(response);

    const dataField = shape.fields.find(f => f.key === 'data');
    expect(dataField).toBeDefined();
    expect(dataField!.type).toBe('null');
    expect(dataField!.isNull).toBe(true);
  });

  it('caps nested keys at 20', () => {
    const bigObject: Record<string, unknown> = {};
    for (let i = 0; i < 25; i++) {
      bigObject[`key${i}`] = i;
    }
    const response = { big: bigObject };

    const shape = captureResponseShape(response);
    const bigField = shape.fields.find(f => f.key === 'big');
    expect(bigField!.nestedKeys!.length).toBeLessThanOrEqual(20);
  });
});

describe('formatResponseShape', () => {
  it('formats object shape as readable string', () => {
    const shape: RawResponseShape = {
      fields: [
        { key: 'name', type: 'string', isNull: false },
        { key: 'clips', type: 'array', arrayLength: 3, isNull: false },
        { key: 'meta', type: 'object', nestedKeys: ['duration', 'fps'], isNull: false },
      ],
      topLevelKeyCount: 3,
      isArray: false,
      capturedAt: '2026-01-01T00:00:00.000Z',
      source: 'test-api',
    };

    const formatted = formatResponseShape(shape);

    expect(formatted).toContain('Source: test-api');
    expect(formatted).toContain('Root: Object (3 keys)');
    expect(formatted).toContain('name: string');
    expect(formatted).toContain('clips: array[3]');
    expect(formatted).toContain('meta: object {duration, fps}');
  });

  it('formats array shape', () => {
    const shape: RawResponseShape = {
      fields: [
        { key: '[0]', type: 'object', nestedKeys: ['id'], isNull: false },
      ],
      topLevelKeyCount: 0,
      isArray: true,
      rootArrayLength: 5,
      capturedAt: '2026-01-01T00:00:00.000Z',
    };

    const formatted = formatResponseShape(shape);
    expect(formatted).toContain('Root: Array[5]');
  });
});
