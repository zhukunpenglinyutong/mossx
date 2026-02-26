function decodeFileUriPath(input: string): string | null {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "file:") {
      return null;
    }
    const decodedPath = decodeURIComponent(parsed.pathname || "");
    const host = parsed.hostname;
    const normalizedHost = host.toLowerCase();
    const isLocalHost = normalizedHost === "localhost" || normalizedHost === "127.0.0.1";
    if (host) {
      if (isLocalHost) {
        // file://localhost/... should be treated as a local file URI, not UNC path.
        if (/^\/[a-zA-Z]:\//.test(decodedPath)) {
          return decodedPath.slice(1);
        }
        return decodedPath || null;
      }
      if (/^[a-zA-Z]:$/.test(host)) {
        return `${host}${decodedPath}`;
      }
      return `//${host}${decodedPath}`;
    }
    if (/^\/[a-zA-Z]:\//.test(decodedPath)) {
      return decodedPath.slice(1);
    }
    return decodedPath || null;
  } catch {
    return null;
  }
}

export function normalizeSpecRootInput(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }
  if (/^file:/i.test(trimmed)) {
    const decoded = decodeFileUriPath(trimmed);
    if (decoded && decoded.trim()) {
      return decoded.trim();
    }
    const fallback = trimmed
      .replace(/^file:(\/\/)?/i, "")
      .replace(/^\/([a-zA-Z]:[\\/])/, "$1");
    const normalizedFallback = fallback.trim();
    return normalizedFallback || null;
  }
  return trimmed;
}

export function isAbsoluteSpecRootInput(path: string | null | undefined): boolean {
  const normalized = normalizeSpecRootInput(path);
  if (!normalized) {
    return false;
  }
  if (normalized.startsWith("/")) {
    return true;
  }
  if (/^[a-zA-Z]:[\\/]/.test(normalized)) {
    return true;
  }
  if (/^\\\\\?\\UNC\\[^\\]+\\[^\\]+/.test(normalized)) {
    return true;
  }
  if (/^\\\\\?\\[a-zA-Z]:[\\/]/.test(normalized)) {
    return true;
  }
  if (/^\\\\[^\\]+\\[^\\]+/.test(normalized)) {
    return true;
  }
  if (/^\/\/[^/]+\/[^/]+/.test(normalized)) {
    return true;
  }
  return false;
}
