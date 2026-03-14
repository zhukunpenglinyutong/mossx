function stripRelativePrefix(path: string) {
  return path.replace(/^\.\/+/, "");
}

export function normalizeFsPath(path: string) {
  try {
    return decodeURIComponent(path)
      .replace(/\\/g, "/")
      .replace(/^\/([a-zA-Z]:\/)/, "$1")
      .replace(/\/+$/, "");
  } catch {
    return path
      .replace(/\\/g, "/")
      .replace(/^\/([a-zA-Z]:\/)/, "$1")
      .replace(/\/+$/, "");
  }
}

export function isLikelyWindowsFsPath(path: string) {
  return /^[a-zA-Z]:\//.test(path) || path.startsWith("//");
}

export function normalizeComparablePath(path: string, caseInsensitive: boolean) {
  const normalized = normalizeFsPath(path);
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}

export function resolveWorkspaceRelativePath(
  workspacePath: string | null | undefined,
  path: string,
) {
  const normalizedPath = normalizeFsPath(path).trim();
  if (!workspacePath) {
    return stripRelativePrefix(normalizedPath);
  }
  const normalizedWorkspace = normalizeFsPath(workspacePath).replace(/\/+$/, "");
  if (!normalizedWorkspace) {
    return stripRelativePrefix(normalizedPath);
  }

  const caseInsensitive = isLikelyWindowsFsPath(normalizedWorkspace);
  const comparablePath = normalizeComparablePath(normalizedPath, caseInsensitive);
  const comparableWorkspace = normalizeComparablePath(
    normalizedWorkspace,
    caseInsensitive,
  );
  if (comparablePath === comparableWorkspace) {
    return "";
  }
  if (comparablePath.startsWith(`${comparableWorkspace}/`)) {
    return normalizedPath.slice(normalizedWorkspace.length + 1);
  }
  return stripRelativePrefix(normalizedPath);
}

export function resolveDiffPathFromWorkspacePath(
  rawPath: string,
  availablePaths: string[],
  workspacePath: string | null | undefined,
) {
  const normalizedInput = normalizeFsPath(rawPath).trim();
  const normalizedWorkspace = workspacePath
    ? normalizeFsPath(workspacePath).replace(/\/+$/, "")
    : "";
  const caseInsensitive = isLikelyWindowsFsPath(normalizedWorkspace);
  const comparableAvailable = new Map(
    availablePaths.map((path) => [
      normalizeComparablePath(path, caseInsensitive),
      path,
    ]),
  );

  const candidates = new Set<string>([
    stripRelativePrefix(normalizedInput),
    resolveWorkspaceRelativePath(workspacePath, normalizedInput),
  ]);
  if (normalizedInput.startsWith("/")) {
    candidates.add(normalizedInput.slice(1));
  }

  for (const candidate of candidates) {
    const matched = comparableAvailable.get(
      normalizeComparablePath(candidate, caseInsensitive),
    );
    if (matched) {
      return matched;
    }
  }

  for (const candidate of candidates) {
    const comparableCandidate = normalizeComparablePath(candidate, caseInsensitive);
    const suffixMatch = availablePaths.find((path) =>
      normalizeComparablePath(path, caseInsensitive).endsWith(`/${comparableCandidate}`),
    );
    if (suffixMatch) {
      return suffixMatch;
    }
  }

  const inputBaseName = normalizedInput.split("/").pop() ?? normalizedInput;
  const sameNamePaths = availablePaths.filter((path) => {
    const baseName = path.split("/").pop() ?? path;
    return normalizeComparablePath(baseName, caseInsensitive) ===
      normalizeComparablePath(inputBaseName, caseInsensitive);
  });
  if (sameNamePaths.length === 1) {
    return sameNamePaths[0];
  }

  return resolveWorkspaceRelativePath(workspacePath, normalizedInput);
}
