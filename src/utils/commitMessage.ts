export function shouldApplyCommitMessage(
  activeWorkspaceId: string | null,
  requestWorkspaceId: string,
): boolean {
  return activeWorkspaceId === requestWorkspaceId;
}

const CONVENTIONAL_COMMIT_TITLE_PATTERN =
  /^[a-z][a-z0-9-]*(\([^)]+\))?!?\s*[:：]\s*\S+/i;

function normalizeCommitLinePrefix(line: string): string {
  return line
    .trim()
    .replace(/^[-*>\s]+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^`+|`+$/g, "");
}

function isConventionalCommitTitle(line: string): boolean {
  const normalized = normalizeCommitLinePrefix(line);
  return CONVENTIONAL_COMMIT_TITLE_PATTERN.test(normalized);
}

function normalizeCommitTitleSeparator(line: string): string {
  const withAsciiColon = line.replace("：", ":");
  return withAsciiColon.replace(
    /^([a-z][a-z0-9-]*(\([^)]+\))?!?)\s*:\s*/i,
    "$1: ",
  );
}

function extractCommitFromText(content: string): string | null {
  const lines = content.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => isConventionalCommitTitle(line));
  if (startIndex < 0) {
    return null;
  }
  const extractedLines = lines.slice(startIndex);
  if (extractedLines.length === 0) {
    return null;
  }
  extractedLines[0] = normalizeCommitTitleSeparator(
    normalizeCommitLinePrefix(extractedLines[0] ?? ""),
  );
  while (extractedLines.length > 0) {
    const tail = extractedLines[extractedLines.length - 1]?.trim() ?? "";
    if (tail === "" || tail.startsWith("```")) {
      extractedLines.pop();
      continue;
    }
    break;
  }
  const extracted = extractedLines.join("\n").trim();
  return extracted || null;
}

function extractFencedBlocks(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const blocks: string[] = [];
  let inFence = false;
  let current: string[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```")) {
      if (inFence) {
        blocks.push(current.join("\n"));
        current = [];
        inFence = false;
      } else {
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      current.push(line);
    }
  }
  if (inFence && current.length > 0) {
    blocks.push(current.join("\n"));
  }
  return blocks;
}

export function sanitizeGeneratedCommitMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  const fencedBlocks = extractFencedBlocks(trimmed);
  for (const block of fencedBlocks) {
    const extracted = extractCommitFromText(block);
    if (extracted) {
      return extracted;
    }
  }
  return extractCommitFromText(trimmed) ?? trimmed;
}
