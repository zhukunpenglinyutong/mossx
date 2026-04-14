import { normalizeComparablePath, normalizeFsPath } from "../../../utils/workspacePaths";

export const NAVIGATION_REQUEST_TIMEOUT_MS = 8_000;
export const CODE_INTEL_CACHE_TTL_MS = 3_000;
export const CODE_INTEL_REPEAT_DEBOUNCE_MS = 120;

export type LspLocationLike = {
  uri: string;
  path?: string | null;
  line: number;
  character: number;
};

export type LocationCacheEntry = {
  expiresAt: number;
  value: LspLocationLike[];
};

export type RecentTrigger = {
  key: string;
  at: number;
};

export function makeLocationQueryKey(
  filePath: string,
  line: number,
  character: number,
  includeDeclaration?: boolean,
) {
  return `${filePath}:${line}:${character}:${includeDeclaration ? "1" : "0"}`;
}

export function toFileUri(absolutePath: string) {
  const normalizedPath = normalizeFsPath(absolutePath);
  const encodedPath = encodeURI(normalizedPath);
  if (encodedPath.startsWith("//")) {
    return `file:${encodedPath}`;
  }
  if (encodedPath.startsWith("/")) {
    return `file://${encodedPath}`;
  }
  return `file:///${encodedPath}`;
}

function fileUriToFsPath(fileUri: string) {
  if (!fileUri.startsWith("file://")) {
    return null;
  }
  try {
    const url = new URL(fileUri);
    if (url.host && url.host !== "localhost") {
      return normalizeFsPath(`//${url.host}${url.pathname}`);
    }
    return normalizeFsPath(url.pathname);
  } catch {
    return null;
  }
}

export function areFileUrisEquivalent(
  leftUri: string,
  rightUri: string,
  caseInsensitive: boolean,
) {
  const leftPath = fileUriToFsPath(leftUri);
  const rightPath = fileUriToFsPath(rightUri);
  if (!leftPath || !rightPath) {
    return leftUri === rightUri;
  }
  return (
    normalizeComparablePath(leftPath, caseInsensitive) ===
    normalizeComparablePath(rightPath, caseInsensitive)
  );
}

export function relativePathFromFileUri(fileUri: string, workspacePath: string) {
  const normalizedWorkspace = normalizeFsPath(workspacePath);
  if (!normalizedWorkspace) {
    return null;
  }
  const caseInsensitive = /^[a-zA-Z]:\//.test(normalizedWorkspace) || normalizedWorkspace.startsWith("//");

  const fromUri = fileUri.startsWith("file://")
    ? fileUriToFsPath(fileUri)
    : fileUri.startsWith("/")
      ? normalizeFsPath(fileUri)
      : null;

  if (!fromUri) {
    return null;
  }

  const comparableUri = normalizeComparablePath(fromUri, caseInsensitive);
  const comparableWorkspace = normalizeComparablePath(
    normalizedWorkspace,
    caseInsensitive,
  );
  if (comparableUri === comparableWorkspace) {
    return "";
  }
  if (!comparableUri.startsWith(`${comparableWorkspace}/`)) {
    return null;
  }
  return fromUri.slice(normalizedWorkspace.length + 1);
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

export function errorMessageFromUnknown(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
) {
  return new Promise<T>((resolve, reject) => {
    const timerId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timerId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timerId);
        reject(error);
      });
  });
}

export function readFreshCache(cache: Map<string, LocationCacheEntry>, key: string) {
  const cached = cache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

export function extractLocations(payload: unknown): LspLocationLike[] {
  const values = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { result?: unknown[] } | null)?.result)
      ? (payload as { result: unknown[] }).result
      : [];

  const locations: LspLocationLike[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const value = entry as Record<string, unknown>;
    const directPath = typeof value.path === "string" ? value.path : null;
    const directUri = typeof value.uri === "string" ? value.uri : null;
    const directRange =
      value.range && typeof value.range === "object"
        ? (value.range as Record<string, unknown>)
        : null;
    const directStart =
      directRange?.start && typeof directRange.start === "object"
        ? (directRange.start as Record<string, unknown>)
        : null;

    if (directUri && directStart) {
      const line = toNumber(directStart.line);
      const character = toNumber(directStart.character);
      if (line !== null && character !== null) {
        locations.push({
          uri: directUri,
          path: directPath,
          line,
          character,
        });
        continue;
      }
    }

    const targetUri = typeof value.targetUri === "string" ? value.targetUri : null;
    const targetPath = typeof value.targetPath === "string" ? value.targetPath : null;
    const targetSelectionRange =
      value.targetSelectionRange && typeof value.targetSelectionRange === "object"
        ? (value.targetSelectionRange as Record<string, unknown>)
        : null;
    const targetRange =
      value.targetRange && typeof value.targetRange === "object"
        ? (value.targetRange as Record<string, unknown>)
        : null;
    const fallbackTarget = targetSelectionRange ?? targetRange;
    const fallbackStart =
      fallbackTarget?.start && typeof fallbackTarget.start === "object"
        ? (fallbackTarget.start as Record<string, unknown>)
        : null;
    if (targetUri && fallbackStart) {
      const line = toNumber(fallbackStart.line);
      const character = toNumber(fallbackStart.character);
      if (line !== null && character !== null) {
        locations.push({
          uri: targetUri,
          path: targetPath,
          line,
          character,
        });
      }
    }
  }

  return locations;
}
