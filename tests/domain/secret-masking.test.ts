/**
 * Tests for secret masking utilities (v0.3.0 resiliency enhancement).
 *
 * Verifies that API keys and tokens are properly masked before
 * inclusion in error messages, typed errors, and log output.
 */

import { maskSecret, maskSecretsInMessage } from '../../src/domain/errors';

describe('maskSecret', () => {
  it('masks all but last 4 characters for long secrets', () => {
    const secret = 'sk-abc123def456'; // 15 chars
    const result = maskSecret(secret);
    // Should be (length - 4) asterisks + last 4 chars
    expect(result).toBe('*'.repeat(secret.length - 4) + secret.slice(-4));
    expect(result).not.toContain('abc123');
  });

  it('fully masks secrets shorter than 8 characters', () => {
    expect(maskSecret('short')).toBe('****');
    expect(maskSecret('1234567')).toBe('****');
  });

  it('preserves last 4 characters for 8-character secrets', () => {
    const result = maskSecret('12345678');
    expect(result).toBe('****5678');
  });

  it('handles empty string', () => {
    expect(maskSecret('')).toBe('****');
  });

  it('handles very long secrets', () => {
    const longSecret = 'a'.repeat(100);
    const result = maskSecret(longSecret);
    expect(result.length).toBe(100);
    expect(result.endsWith('aaaa')).toBe(true);
    expect(result.startsWith('*')).toBe(true);
  });
});

describe('maskSecretsInMessage', () => {
  it('masks a single secret in a message', () => {
    const result = maskSecretsInMessage(
      'Connection failed for key sk-abc123def456',
      ['sk-abc123def456'],
    );
    expect(result).toContain('**********f456');
    expect(result).not.toContain('sk-abc123def456');
  });

  it('masks multiple occurrences of the same secret', () => {
    const result = maskSecretsInMessage(
      'Key sk-test1234 was rejected. Tried sk-test1234 again.',
      ['sk-test1234'],
    );
    const count = (result.match(/\*\*\*\*/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
    expect(result).not.toContain('sk-test1234');
  });

  it('masks multiple different secrets', () => {
    const result = maskSecretsInMessage(
      'Provider A (key-aaaa1111) and provider B (key-bbbb2222) both failed',
      ['key-aaaa1111', 'key-bbbb2222'],
    );
    expect(result).not.toContain('key-aaaa1111');
    expect(result).not.toContain('key-bbbb2222');
  });

  it('returns unchanged message when no secrets match', () => {
    const msg = 'No secrets here';
    expect(maskSecretsInMessage(msg, ['notfound'])).toBe(msg);
  });

  it('returns unchanged message for empty secrets array', () => {
    const msg = 'Some message';
    expect(maskSecretsInMessage(msg, [])).toBe(msg);
  });

  it('handles secrets with regex-special characters', () => {
    const secret = 'key+special.chars?';
    const result = maskSecretsInMessage(
      `Failed with ${secret}`,
      [secret],
    );
    expect(result).not.toContain(secret);
  });
});
