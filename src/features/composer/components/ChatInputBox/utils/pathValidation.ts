/**
 * Validate a file path to prevent path traversal attacks.
 * Returns the sanitized path, or null if the path is suspicious.
 */
export function validateFilePath(filePath: string): string | null {
  const trimmed = filePath.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/\\/g, '/');

  // Reject paths with directory traversal
  if (normalized.includes('/../') || normalized.startsWith('../') || normalized.endsWith('/..')) {
    return null;
  }

  // Reject paths targeting sensitive system directories
  const sensitivePatterns = [
    '/etc/passwd', '/etc/shadow', '/proc/', '/sys/',
    '/.ssh/', '/.env', '/.aws/', '/.gnupg/',
  ];
  const lower = normalized.toLowerCase();
  if (sensitivePatterns.some(p => lower.includes(p))) {
    return null;
  }

  return trimmed;
}
