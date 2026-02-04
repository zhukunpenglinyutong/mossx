export type ParsedDiffLine = {
  type: "add" | "del" | "context" | "hunk" | "meta";
  oldLine: number | null;
  newLine: number | null;
  text: string;
};

const HUNK_REGEX = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseDiff(diff: string): ParsedDiffLine[] {
  const lines = diff.split("\n");
  const parsed: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = HUNK_REGEX.exec(line);
      if (match) {
        oldLine = Number(match[1]);
        newLine = Number(match[3]);
      }
      parsed.push({
        type: "hunk",
        oldLine: null,
        newLine: null,
        text: line,
      });
      inHunk = true;
      continue;
    }

    if (!inHunk) {
      continue;
    }

    if (line.startsWith("+")) {
      parsed.push({
        type: "add",
        oldLine: null,
        newLine,
        text: line.slice(1),
      });
      newLine += 1;
      continue;
    }

    if (line.startsWith("-")) {
      parsed.push({
        type: "del",
        oldLine,
        newLine: null,
        text: line.slice(1),
      });
      oldLine += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      parsed.push({
        type: "context",
        oldLine,
        newLine,
        text: line.slice(1),
      });
      oldLine += 1;
      newLine += 1;
      continue;
    }

    if (line.startsWith("\\")) {
      parsed.push({
        type: "meta",
        oldLine: null,
        newLine: null,
        text: line,
      });
    }
  }

  return parsed;
}
