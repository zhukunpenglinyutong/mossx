import Check from "lucide-react/dist/esm/icons/check";
import Minus from "lucide-react/dist/esm/icons/minus";

export type InclusionState = "all" | "none" | "partial";

export function normalizeDiffPath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function isPathInScope(path: string, scopePath?: string | null) {
  const normalizedPath = normalizeDiffPath(path);
  const normalizedScope = normalizeDiffPath(scopePath ?? "");
  if (!normalizedScope) {
    return true;
  }
  return (
    normalizedPath === normalizedScope ||
    normalizedPath.startsWith(`${normalizedScope}/`)
  );
}

export function getInclusionStateForScope(
  includedPaths: string[],
  excludedPaths: string[],
  partialPaths: string[] = [],
  scopePath?: string | null,
): InclusionState {
  let includedCount = 0;
  let excludedCount = 0;
  let partialCount = 0;

  for (const path of includedPaths) {
    if (isPathInScope(path, scopePath)) {
      includedCount += 1;
    }
  }
  for (const path of excludedPaths) {
    if (isPathInScope(path, scopePath)) {
      excludedCount += 1;
    }
  }
  for (const path of partialPaths) {
    if (isPathInScope(path, scopePath)) {
      partialCount += 1;
    }
  }

  if (includedCount === 0 && excludedCount === 0 && partialCount === 0) {
    return "none";
  }
  if (partialCount > 0) {
    return "partial";
  }
  if (includedCount === 0) {
    return "none";
  }
  if (excludedCount === 0) {
    return "all";
  }
  return "partial";
}

export function getFileInclusionState(
  path: string,
  includedPaths: Set<string>,
  excludedPaths: Set<string>,
  partialPaths: Set<string> = new Set(),
): InclusionState {
  const normalizedPath = normalizeDiffPath(path);
  if (partialPaths.has(normalizedPath)) {
    return "partial";
  }
  const isIncluded = includedPaths.has(normalizedPath);
  const isExcluded = excludedPaths.has(normalizedPath);
  if (isIncluded && isExcluded) {
    return "partial";
  }
  return isIncluded ? "all" : "none";
}

export async function runSequentialPathAction(
  paths: string[],
  action?: (path: string) => Promise<void> | void,
) {
  if (!action) {
    return;
  }
  for (const path of paths) {
    await action(path);
  }
}

type InclusionToggleProps = {
  state: InclusionState;
  label: string;
  onToggle: () => void;
  className?: string;
  disabled?: boolean;
  stopPropagation?: boolean;
};

export function InclusionToggle({
  state,
  label,
  onToggle,
  className,
  disabled = false,
  stopPropagation = false,
}: InclusionToggleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "partial" ? "mixed" : state === "all"}
      aria-label={label}
      title={label}
      className={`git-commit-scope-toggle is-${state}${className ? ` ${className}` : ""}`}
      disabled={disabled}
      onClick={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
        onToggle();
      }}
    >
      {state === "all" ? <Check size={12} aria-hidden /> : null}
      {state === "partial" ? <Minus size={12} aria-hidden /> : null}
    </button>
  );
}
