import type {
  CodeAnnotationDraftInput,
  CodeAnnotationLineRange,
  CodeAnnotationSelection,
} from "../types";

function normalizeAnnotationPath(path: string) {
  return path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function toCodeAnnotationPathKey(path: string) {
  const normalizedPath = normalizeAnnotationPath(path);
  return /^[A-Za-z]:\//.test(normalizedPath)
    ? normalizedPath.toLowerCase()
    : normalizedPath;
}

function normalizeLineRange(
  lineRange: CodeAnnotationLineRange,
): CodeAnnotationLineRange | null {
  const startLine = Math.trunc(lineRange.startLine);
  const endLine = Math.trunc(lineRange.endLine);
  if (
    !Number.isFinite(startLine) ||
    !Number.isFinite(endLine) ||
    startLine < 1 ||
    endLine < 1
  ) {
    return null;
  }
  return {
    startLine: Math.min(startLine, endLine),
    endLine: Math.max(startLine, endLine),
  };
}

export function normalizeCodeAnnotationTarget(
  input: CodeAnnotationDraftInput,
): CodeAnnotationDraftInput | null {
  const path = normalizeAnnotationPath(input.path);
  const body = input.body.trim();
  const lineRange = normalizeLineRange(input.lineRange);
  if (!path || !body || !lineRange) {
    return null;
  }
  return {
    path,
    lineRange,
    body,
    source: input.source,
  };
}

export function formatCodeAnnotationLineRange(lineRange: CodeAnnotationLineRange) {
  if (lineRange.startLine === lineRange.endLine) {
    return `L${lineRange.startLine}`;
  }
  return `L${lineRange.startLine}-L${lineRange.endLine}`;
}

export function formatCodeAnnotationReference(
  selection: Pick<CodeAnnotationSelection, "path" | "lineRange">,
) {
  return `${selection.path}#${formatCodeAnnotationLineRange(selection.lineRange)}`;
}

export function buildCodeAnnotationDedupeKey(selection: CodeAnnotationDraftInput) {
  const normalized = normalizeCodeAnnotationTarget(selection);
  if (!normalized) {
    return "";
  }
  return [
    toCodeAnnotationPathKey(normalized.path),
    normalized.lineRange.startLine,
    normalized.lineRange.endLine,
    normalized.body,
  ].join("::");
}

export function isSameCodeAnnotationPath(leftPath: string, rightPath: string) {
  const leftKey = toCodeAnnotationPathKey(leftPath);
  const rightKey = toCodeAnnotationPathKey(rightPath);
  return Boolean(leftKey) && leftKey === rightKey;
}

function stableAnnotationHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function formatCodeAnnotationForPrompt(selection: CodeAnnotationSelection) {
  return [
    `@file \`${formatCodeAnnotationReference(selection)}\``,
    `标注：${selection.body}`,
  ].join("\n");
}

export function createCodeAnnotationSelection(
  input: CodeAnnotationDraftInput,
): CodeAnnotationSelection | null {
  const normalized = normalizeCodeAnnotationTarget(input);
  if (!normalized) {
    return null;
  }
  const dedupeKey = buildCodeAnnotationDedupeKey(normalized);
  return {
    id: `code-annotation:${stableAnnotationHash(dedupeKey)}`,
    ...normalized,
  };
}

export function appendCodeAnnotationsToPrompt(
  message: string,
  annotations: CodeAnnotationSelection[],
) {
  if (annotations.length === 0) {
    return message;
  }
  const annotationBlock = annotations.map(formatCodeAnnotationForPrompt).join("\n\n");
  return [message.trim(), annotationBlock].filter(Boolean).join("\n\n");
}
