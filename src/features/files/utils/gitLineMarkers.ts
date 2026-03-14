export type GitLineMarkers = {
  added: number[];
  modified: number[];
};

export function parseLineMarkersFromDiff(diffText: string): GitLineMarkers {
  if (!diffText.trim()) {
    return { added: [], modified: [] };
  }
  const addedLines = new Set<number>();
  const modifiedLines = new Set<number>();
  const lines = diffText.split("\n");
  let inHunk = false;
  let newLineNumber = 0;
  let pendingDeletedCount = 0;
  let pendingAddedLines: number[] = [];

  const flushPending = () => {
    if (pendingAddedLines.length > 0) {
      if (pendingDeletedCount > 0) {
        for (const lineNumber of pendingAddedLines) {
          modifiedLines.add(lineNumber);
        }
      } else {
        for (const lineNumber of pendingAddedLines) {
          addedLines.add(lineNumber);
        }
      }
    }
    pendingDeletedCount = 0;
    pendingAddedLines = [];
  };

  for (const line of lines) {
    if (line.startsWith("@@")) {
      flushPending();
      const match = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      if (!match) {
        inHunk = false;
        continue;
      }
      inHunk = true;
      newLineNumber = Number(match[1]);
      continue;
    }
    if (!inHunk) {
      continue;
    }
    if (line.startsWith("diff --git")) {
      flushPending();
      inHunk = false;
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      pendingDeletedCount += 1;
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      pendingAddedLines.push(newLineNumber);
      newLineNumber += 1;
      continue;
    }
    if (line.startsWith("\\")) {
      continue;
    }
    flushPending();
    newLineNumber += 1;
  }

  flushPending();
  return {
    added: Array.from(addedLines).sort((a, b) => a - b),
    modified: Array.from(modifiedLines).sort((a, b) => a - b),
  };
}

export function findPrimaryGitMarkerLine(markers: GitLineMarkers): number | null {
  return markers.modified[0] ?? markers.added[0] ?? null;
}
