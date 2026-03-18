import { validateFilePath } from "./pathValidation.js";

type InsertFilePathReferencesArgs = {
  editableRef: React.RefObject<HTMLDivElement | null>;
  pathMappingRef: React.MutableRefObject<Map<string, string>>;
  filePaths: string[];
  getTextContent: () => string;
  adjustHeight: () => void;
  renderFileTags: () => void;
  setHasContent: (hasContent: boolean) => void;
  onInput?: (content: string) => void;
  fileCompletion?: { close: () => void };
  commandCompletion?: { close: () => void };
};

export function normalizePathForComparison(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }
  let normalized = trimmed.replace(/\\/g, "/");
  const driveMatch = normalized.match(/^([a-zA-Z]):(\/|$)/);
  if (driveMatch) {
    normalized = `${driveMatch[1].toLowerCase()}:${normalized.slice(2)}`;
  }
  return normalized;
}

export function dedupeAndValidateFilePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawPath of paths) {
    const validated = validateFilePath(rawPath);
    if (!validated) {
      continue;
    }
    const dedupeKey = normalizePathForComparison(validated);
    if (!dedupeKey || seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    result.push(validated);
  }

  return result;
}

function insertTextAtCursorOrAppend(
  editable: HTMLDivElement,
  text: string,
) {
  const selection = window.getSelection();
  if (
    selection &&
    selection.rangeCount > 0 &&
    editable.contains(selection.anchorNode)
  ) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }

  const textNode = document.createTextNode(text);
  editable.appendChild(textNode);
  if (selection) {
    const range = document.createRange();
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

export function insertFilePathReferences({
  editableRef,
  pathMappingRef,
  filePaths,
  getTextContent,
  adjustHeight,
  renderFileTags,
  setHasContent,
  onInput,
  fileCompletion,
  commandCompletion,
}: InsertFilePathReferencesArgs): string[] {
  const editable = editableRef.current;
  if (!editable) {
    return [];
  }

  const validPaths = dedupeAndValidateFilePaths(filePaths);
  if (validPaths.length === 0) {
    return [];
  }

  for (const absolutePath of validPaths) {
    const fileName = absolutePath.split(/[/\\]/).pop() || absolutePath;
    pathMappingRef.current.set(fileName, absolutePath);
    pathMappingRef.current.set(absolutePath, absolutePath);
  }

  const insertionText = `${validPaths
    .map((path) => (path.startsWith("@") ? path : `@${path}`))
    .join(" ")} `;
  insertTextAtCursorOrAppend(editable, insertionText);

  fileCompletion?.close();
  commandCompletion?.close();

  const newText = getTextContent();
  setHasContent(!!newText.trim());
  adjustHeight();
  onInput?.(newText);
  setTimeout(() => {
    renderFileTags();
  }, 50);

  return validPaths;
}

export function parsePathsFromDropText(
  text: string,
): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(normalized);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);
    }
  } catch {
    // fallback to line-based parsing
  }

  return normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      if (!line.toLowerCase().startsWith("file://")) {
        return line;
      }
      try {
        const url = new URL(line);
        if (url.protocol !== "file:") {
          return line;
        }
        const decodedPath = decodeURIComponent(url.pathname);
        if (/^\/[A-Za-z]:\//.test(decodedPath)) {
          return decodedPath.slice(1).replace(/\//g, "\\");
        }
        return decodedPath;
      } catch {
        return line;
      }
    })
    .filter(Boolean);
}
