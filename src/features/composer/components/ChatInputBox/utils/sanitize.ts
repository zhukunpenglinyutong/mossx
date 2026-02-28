import DOMPurify from 'dompurify';

/**
 * Sanitize SVG string to prevent XSS attacks.
 * Allows only safe SVG elements and attributes.
 */
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'style'],
    FORBID_ATTR: [
      'onload', 'onerror', 'onclick', 'onmouseover', 'onmouseout',
      'onfocus', 'onblur', 'onsubmit', 'onreset', 'onanimationend',
    ],
  });
}
