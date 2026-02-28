// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addHistoryItem,
  clearAllHistory,
  deleteHistoryItem,
  HISTORY_COUNTS_KEY,
  HISTORY_ENABLED_KEY,
  HISTORY_STORAGE_KEY,
  HISTORY_TIMESTAMPS_KEY,
  isHistoryCompletionEnabled,
  loadCounts,
  loadHistory,
  loadHistoryWithImportance,
  loadTimestamps,
} from './useInputHistory';

// Mock the bridge module to prevent actual IPC calls
vi.mock('../../../utils/bridge.js', () => ({
  sendToJava: vi.fn(),
}));

describe('useInputHistory pure functions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('loadHistory', () => {
    it('returns empty array when localStorage has no history', () => {
      expect(loadHistory()).toEqual([]);
    });

    it('returns stored history items', () => {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(['hello', 'world']));
      expect(loadHistory()).toEqual(['hello', 'world']);
    });

    it('filters out non-string values', () => {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(['valid', 123, null, '', 'ok']));
      expect(loadHistory()).toEqual(['valid', 'ok']);
    });

    it('filters out empty strings', () => {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(['hello', '', '  ', 'world']));
      // Only truly empty strings are filtered ('  ' has length > 0, passes the filter)
      expect(loadHistory()).toEqual(['hello', '  ', 'world']);
    });

    it('returns empty array for invalid JSON', () => {
      localStorage.setItem(HISTORY_STORAGE_KEY, 'not-json{');
      expect(loadHistory()).toEqual([]);
    });

    it('returns empty array if stored value is not an array', () => {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ key: 'value' }));
      expect(loadHistory()).toEqual([]);
    });
  });

  describe('loadCounts', () => {
    it('returns empty object when localStorage has no counts', () => {
      expect(loadCounts()).toEqual({});
    });

    it('returns stored counts', () => {
      localStorage.setItem(HISTORY_COUNTS_KEY, JSON.stringify({ hello: 3, world: 1 }));
      expect(loadCounts()).toEqual({ hello: 3, world: 1 });
    });

    it('filters out non-number values', () => {
      localStorage.setItem(HISTORY_COUNTS_KEY, JSON.stringify({ a: 1, b: 'string', c: null, d: 2 }));
      expect(loadCounts()).toEqual({ a: 1, d: 2 });
    });

    it('filters out non-finite numbers', () => {
      localStorage.setItem(HISTORY_COUNTS_KEY, JSON.stringify({ a: 1, b: Infinity, c: NaN }));
      // JSON.stringify converts Infinity and NaN to null, so they become non-number
      expect(loadCounts()).toEqual({ a: 1 });
    });

    it('returns empty object for invalid JSON', () => {
      localStorage.setItem(HISTORY_COUNTS_KEY, '{invalid}');
      expect(loadCounts()).toEqual({});
    });

    it('returns empty object if stored value is an array', () => {
      localStorage.setItem(HISTORY_COUNTS_KEY, JSON.stringify([1, 2, 3]));
      expect(loadCounts()).toEqual({});
    });

    it('returns empty object if stored value is null', () => {
      localStorage.setItem(HISTORY_COUNTS_KEY, 'null');
      expect(loadCounts()).toEqual({});
    });
  });

  describe('loadTimestamps', () => {
    it('returns empty object when localStorage has no timestamps', () => {
      expect(loadTimestamps()).toEqual({});
    });

    it('returns stored timestamps', () => {
      const ts = { hello: '2024-01-01T00:00:00Z', world: '2024-06-01T12:00:00Z' };
      localStorage.setItem(HISTORY_TIMESTAMPS_KEY, JSON.stringify(ts));
      expect(loadTimestamps()).toEqual(ts);
    });

    it('filters out non-string values', () => {
      localStorage.setItem(HISTORY_TIMESTAMPS_KEY, JSON.stringify({ a: '2024-01-01', b: 123, c: null }));
      expect(loadTimestamps()).toEqual({ a: '2024-01-01' });
    });

    it('returns empty object for invalid JSON', () => {
      localStorage.setItem(HISTORY_TIMESTAMPS_KEY, 'bad-json');
      expect(loadTimestamps()).toEqual({});
    });

    it('returns empty object if stored value is an array', () => {
      localStorage.setItem(HISTORY_TIMESTAMPS_KEY, JSON.stringify(['a', 'b']));
      expect(loadTimestamps()).toEqual({});
    });
  });

  describe('loadHistoryWithImportance', () => {
    it('returns empty array when no history exists', () => {
      expect(loadHistoryWithImportance()).toEqual([]);
    });

    it('returns items with default importance of 1', () => {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(['hello', 'world']));
      const result = loadHistoryWithImportance();
      expect(result).toHaveLength(2);
      expect(result[0].importance).toBe(1);
      expect(result[1].importance).toBe(1);
    });

    it('uses stored counts for importance', () => {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(['alpha', 'beta']));
      localStorage.setItem(HISTORY_COUNTS_KEY, JSON.stringify({ alpha: 5, beta: 2 }));
      const result = loadHistoryWithImportance();
      expect(result[0]).toEqual({ text: 'alpha', importance: 5, timestamp: undefined });
      expect(result[1]).toEqual({ text: 'beta', importance: 2, timestamp: undefined });
    });

    it('sorts by importance descending', () => {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(['low', 'high', 'mid']));
      localStorage.setItem(HISTORY_COUNTS_KEY, JSON.stringify({ low: 1, high: 10, mid: 5 }));
      const result = loadHistoryWithImportance();
      expect(result[0].text).toBe('high');
      expect(result[1].text).toBe('mid');
      expect(result[2].text).toBe('low');
    });

    it('includes timestamps when available', () => {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(['hello']));
      localStorage.setItem(HISTORY_TIMESTAMPS_KEY, JSON.stringify({ hello: '2024-01-01T00:00:00Z' }));
      const result = loadHistoryWithImportance();
      expect(result[0].timestamp).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('deleteHistoryItem', () => {
    it('removes the item from history', () => {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(['a', 'b', 'c']));
      localStorage.setItem(HISTORY_COUNTS_KEY, JSON.stringify({ a: 1, b: 2, c: 3 }));
      localStorage.setItem(HISTORY_TIMESTAMPS_KEY, JSON.stringify({ a: 't1', b: 't2', c: 't3' }));

      deleteHistoryItem('b');

      expect(loadHistory()).toEqual(['a', 'c']);
      expect(loadCounts()).toEqual({ a: 1, c: 3 });
      expect(loadTimestamps()).toEqual({ a: 't1', c: 't3' });
    });

    it('does nothing if item does not exist', () => {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(['a', 'b']));
      deleteHistoryItem('z');
      expect(loadHistory()).toEqual(['a', 'b']);
    });
  });

  describe('clearAllHistory', () => {
    it('removes all history-related keys from localStorage', () => {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(['a', 'b']));
      localStorage.setItem(HISTORY_COUNTS_KEY, JSON.stringify({ a: 1 }));
      localStorage.setItem(HISTORY_TIMESTAMPS_KEY, JSON.stringify({ a: 't1' }));

      clearAllHistory();

      expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(HISTORY_COUNTS_KEY)).toBeNull();
      expect(localStorage.getItem(HISTORY_TIMESTAMPS_KEY)).toBeNull();
    });

    it('is safe to call when no history exists', () => {
      expect(() => clearAllHistory()).not.toThrow();
    });
  });

  describe('addHistoryItem', () => {
    it('adds a new item to history', () => {
      addHistoryItem('hello world');

      const items = loadHistory();
      expect(items).toContain('hello world');
    });

    it('sets the importance for the item', () => {
      addHistoryItem('test item', 5);

      const counts = loadCounts();
      expect(counts['test item']).toBe(5);
    });

    it('defaults importance to 1', () => {
      addHistoryItem('default importance');

      const counts = loadCounts();
      expect(counts['default importance']).toBe(1);
    });

    it('removes invisible characters from the text', () => {
      addHistoryItem('hello\u200Bworld');

      const items = loadHistory();
      expect(items).toContain('helloworld');
      expect(items).not.toContain('hello\u200Bworld');
    });

    it('does not add empty or whitespace-only strings after sanitization', () => {
      addHistoryItem('');
      addHistoryItem('  ');
      addHistoryItem('\u200B\u200C');

      expect(loadHistory()).toEqual([]);
    });

    it('moves existing item to the end (deduplication)', () => {
      addHistoryItem('first');
      addHistoryItem('second');
      addHistoryItem('first');

      const items = loadHistory();
      expect(items).toEqual(['second', 'first']);
    });

    it('floors fractional importance values', () => {
      addHistoryItem('test', 3.7);

      const counts = loadCounts();
      expect(counts['test']).toBe(3);
    });

    it('enforces minimum importance of 1', () => {
      addHistoryItem('test', 0);

      const counts = loadCounts();
      expect(counts['test']).toBe(1);
    });

    it('sets a timestamp for the item', () => {
      addHistoryItem('timestamped');

      const timestamps = loadTimestamps();
      expect(timestamps['timestamped']).toBeDefined();
      expect(typeof timestamps['timestamped']).toBe('string');
    });
  });

  describe('isHistoryCompletionEnabled', () => {
    it('returns true by default (no value set)', () => {
      expect(isHistoryCompletionEnabled()).toBe(true);
    });

    it('returns true when value is "true"', () => {
      localStorage.setItem(HISTORY_ENABLED_KEY, 'true');
      expect(isHistoryCompletionEnabled()).toBe(true);
    });

    it('returns false when value is "false"', () => {
      localStorage.setItem(HISTORY_ENABLED_KEY, 'false');
      expect(isHistoryCompletionEnabled()).toBe(false);
    });

    it('returns true for any value other than "false"', () => {
      localStorage.setItem(HISTORY_ENABLED_KEY, 'yes');
      expect(isHistoryCompletionEnabled()).toBe(true);

      localStorage.setItem(HISTORY_ENABLED_KEY, '0');
      expect(isHistoryCompletionEnabled()).toBe(true);

      localStorage.setItem(HISTORY_ENABLED_KEY, '');
      expect(isHistoryCompletionEnabled()).toBe(true);
    });
  });
});
