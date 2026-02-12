import {
  detectMediaReferenceKind,
  resolveMediaReference,
  MediaResolutionError,
} from '../../src/domain/media-reference';

describe('detectMediaReferenceKind', () => {
  it('detects HTTPS URIs', () => {
    expect(detectMediaReferenceKind('https://storage.googleapis.com/bucket/video.mp4')).toBe('uri');
  });

  it('detects HTTP URIs', () => {
    expect(detectMediaReferenceKind('http://example.com/file.png')).toBe('uri');
  });

  it('detects GCS URIs', () => {
    expect(detectMediaReferenceKind('gs://my-bucket/video.mp4')).toBe('uri');
  });

  it('detects S3 URIs', () => {
    expect(detectMediaReferenceKind('s3://my-bucket/image.png')).toBe('uri');
  });

  it('detects data URI base64', () => {
    expect(detectMediaReferenceKind('data:video/mp4;base64,AAAA')).toBe('inline-base64');
  });

  it('detects raw base64 strings', () => {
    const longBase64 = 'A'.repeat(300);
    expect(detectMediaReferenceKind(longBase64)).toBe('inline-base64');
  });

  it('detects Buffer as inline-binary', () => {
    expect(detectMediaReferenceKind(Buffer.from('hello'))).toBe('inline-binary');
  });

  it('returns inline-base64 for short unknown strings', () => {
    expect(detectMediaReferenceKind('short')).toBe('inline-base64');
  });
});

describe('resolveMediaReference', () => {
  it('resolves inline base64 data URI with MIME type', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const base64 = pngHeader.toString('base64');
    const dataUri = `data:image/png;base64,${base64}`;

    const result = await resolveMediaReference(dataUri);

    expect(result.kind).toBe('inline-base64');
    expect(result.mimeType).toBe('image/png');
    expect(result.sizeBytes).toBe(pngHeader.length);
    expect(result.resolutionMs).toBeGreaterThanOrEqual(0);
  });

  it('resolves inline Buffer with MIME type detection', async () => {
    // JPEG magic bytes
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    const result = await resolveMediaReference(jpegBuffer);

    expect(result.kind).toBe('inline-binary');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.sizeBytes).toBe(jpegBuffer.length);
  });

  it('rejects content exceeding max size', async () => {
    const largeBuffer = Buffer.alloc(100);

    await expect(
      resolveMediaReference(largeBuffer, { maxSizeBytes: 50 }),
    ).rejects.toThrow(MediaResolutionError);

    try {
      await resolveMediaReference(largeBuffer, { maxSizeBytes: 50 });
    } catch (err) {
      expect(err).toBeInstanceOf(MediaResolutionError);
      expect((err as MediaResolutionError).errorCode).toBe('SIZE_EXCEEDED');
    }
  });

  it('rejects disallowed MIME types', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await expect(
      resolveMediaReference(pngHeader, { allowedMimeTypes: ['video/mp4'] }),
    ).rejects.toThrow(MediaResolutionError);

    try {
      await resolveMediaReference(pngHeader, { allowedMimeTypes: ['video/mp4'] });
    } catch (err) {
      expect(err).toBeInstanceOf(MediaResolutionError);
      expect((err as MediaResolutionError).errorCode).toBe('INVALID_MIME_TYPE');
    }
  });

  it('accepts allowed MIME types', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const result = await resolveMediaReference(pngHeader, {
      allowedMimeTypes: ['image/png', 'image/jpeg'],
    });

    expect(result.mimeType).toBe('image/png');
  });

  it('detects MP4 from buffer magic bytes', async () => {
    // ftyp box: size (4 bytes) + 'ftyp' marker
    const mp4Header = Buffer.alloc(12);
    mp4Header.writeUInt32BE(12, 0);
    mp4Header.write('ftyp', 4, 'ascii');
    mp4Header.write('isom', 8, 'ascii');

    const result = await resolveMediaReference(mp4Header);
    expect(result.mimeType).toBe('video/mp4');
  });

  it('detects WebM from buffer magic bytes', async () => {
    const webmHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00]);

    const result = await resolveMediaReference(webmHeader);
    expect(result.mimeType).toBe('video/webm');
  });

  it('returns application/octet-stream for unknown formats', async () => {
    const unknownBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);

    const result = await resolveMediaReference(unknownBuffer);
    expect(result.mimeType).toBe('application/octet-stream');
  });
});
