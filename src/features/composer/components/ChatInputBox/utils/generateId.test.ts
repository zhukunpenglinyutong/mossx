import { describe, expect, it } from 'vitest';
import { generateId } from './generateId';

describe('generateId', () => {
  it('returns a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
  });

  it('returns a non-empty string', () => {
    const id = generateId();
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates unique ids across multiple calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('returns a valid UUID format when crypto.randomUUID is available', () => {
    // In the Node.js test environment crypto.randomUUID should be available
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      const id = generateId();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(id).toMatch(uuidRegex);
    }
  });

  it('returns a fallback format with timestamp and random string', () => {
    // Test the fallback by temporarily removing crypto.randomUUID
    const originalRandomUUID = crypto.randomUUID;
    try {
      // @ts-expect-error -- intentionally removing for test
      crypto.randomUUID = undefined;

      const id = generateId();
      // Fallback format: timestamp-randomstring
      expect(id).toMatch(/^\d+-[a-z0-9]+$/);
      expect(id).toContain('-');

      const [timestamp] = id.split('-');
      const ts = Number(timestamp);
      expect(ts).toBeGreaterThan(0);
      expect(ts).toBeLessThanOrEqual(Date.now());
    } finally {
      crypto.randomUUID = originalRandomUUID;
    }
  });
});
