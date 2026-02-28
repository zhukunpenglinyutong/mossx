// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from './sanitize';

describe('sanitizeSvg', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeSvg('')).toBe('');
  });

  it('allows safe SVG elements through', () => {
    const safeSvg = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"/></svg>';
    const result = sanitizeSvg(safeSvg);
    expect(result).toContain('<svg');
    expect(result).toContain('<circle');
  });

  it('allows SVG with path element', () => {
    const svg = '<svg><path d="M10 10 H 90 V 90 H 10 Z"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).toContain('<path');
  });

  it('removes script tags', () => {
    const malicious = '<svg><script>alert("xss")</script><circle cx="50" cy="50" r="40"/></svg>';
    const result = sanitizeSvg(malicious);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<circle');
  });

  it('removes style tags', () => {
    const withStyle = '<svg><style>body{display:none}</style><rect width="100" height="100"/></svg>';
    const result = sanitizeSvg(withStyle);
    expect(result).not.toContain('<style');
    expect(result).not.toContain('display:none');
  });

  it('removes onload event attributes', () => {
    const withOnload = '<svg onload="alert(1)"><circle cx="50" cy="50" r="40"/></svg>';
    const result = sanitizeSvg(withOnload);
    expect(result).not.toContain('onload');
    expect(result).not.toContain('alert');
  });

  it('removes onerror event attributes', () => {
    const withOnerror = '<svg><image href="x" onerror="alert(1)"/></svg>';
    const result = sanitizeSvg(withOnerror);
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert');
  });

  it('removes onclick event attributes', () => {
    const withOnclick = '<svg><rect onclick="alert(1)" width="100" height="100"/></svg>';
    const result = sanitizeSvg(withOnclick);
    expect(result).not.toContain('onclick');
  });

  it('removes onmouseover event attributes', () => {
    const withOnmouseover = '<svg><rect onmouseover="alert(1)" width="100" height="100"/></svg>';
    const result = sanitizeSvg(withOnmouseover);
    expect(result).not.toContain('onmouseover');
  });

  it('allows SVG filter elements', () => {
    const svgWithFilter = '<svg><filter id="blur"><feGaussianBlur stdDeviation="5"/></filter></svg>';
    const result = sanitizeSvg(svgWithFilter);
    expect(result).toContain('<filter');
    expect(result).toContain('feGaussianBlur');
  });

  it('preserves safe SVG attributes', () => {
    const svg = '<svg viewBox="0 0 100 100" fill="red"><rect width="50" height="50" fill="blue"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).toContain('viewBox');
    expect(result).toContain('fill');
  });
});
