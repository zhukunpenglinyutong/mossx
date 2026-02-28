import { describe, expect, it } from 'vitest';
import { escapeHtmlAttr } from './htmlEscape';

describe('escapeHtmlAttr', () => {
  it('escapes ampersand', () => {
    expect(escapeHtmlAttr('a&b')).toBe('a&amp;b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtmlAttr('a"b')).toBe('a&quot;b');
  });

  it('escapes single quotes', () => {
    expect(escapeHtmlAttr("a'b")).toBe('a&#39;b');
  });

  it('escapes less-than sign', () => {
    expect(escapeHtmlAttr('a<b')).toBe('a&lt;b');
  });

  it('escapes greater-than sign', () => {
    expect(escapeHtmlAttr('a>b')).toBe('a&gt;b');
  });

  it('escapes multiple special characters in one string', () => {
    expect(escapeHtmlAttr('<div class="test">&\'ok\'</div>')).toBe(
      '&lt;div class=&quot;test&quot;&gt;&amp;&#39;ok&#39;&lt;/div&gt;',
    );
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtmlAttr('')).toBe('');
  });

  it('returns string without special characters unchanged', () => {
    expect(escapeHtmlAttr('hello world 123')).toBe('hello world 123');
  });

  it('does not escape backslashes', () => {
    expect(escapeHtmlAttr('path\\to\\file')).toBe('path\\to\\file');
  });

  it('handles double escaping (already-escaped input gets escaped again)', () => {
    const once = escapeHtmlAttr('a&b');
    expect(once).toBe('a&amp;b');
    const twice = escapeHtmlAttr(once);
    expect(twice).toBe('a&amp;amp;b');
  });

  it('escapes all occurrences of the same character', () => {
    expect(escapeHtmlAttr('a&b&c&d')).toBe('a&amp;b&amp;c&amp;d');
  });

  it('handles unicode characters without escaping', () => {
    expect(escapeHtmlAttr('hello 世界 🌍')).toBe('hello 世界 🌍');
  });
});
