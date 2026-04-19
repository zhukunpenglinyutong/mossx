import type {KeyboardEvent, MouseEvent} from "react";
import {useMemo} from "react";
import {type ParsedDiffLine, parseDiff} from "../../../utils/diff";
import {highlightLine} from "../../../utils/syntax";

type DiffStyle = "split" | "unified";

type DiffHunk = {
    header: string;
    startIndex: number;
    anchorIndex: number | null;
    lines: ParsedDiffLine[];
    patch: string;
};

type HunkAnchor = {
    hunk: DiffHunk;
    isAnchor: boolean;
};

type IndexedDiffLine = {
  index: number;
  line: ParsedDiffLine;
};

type SplitDiffRow =
  | {
      kind: "header";
      key: string;
      line: IndexedDiffLine;
    }
  | {
      kind: "pair";
      key: string;
      left: IndexedDiffLine | null;
      right: IndexedDiffLine | null;
    hunkAnchor: HunkAnchor | null;
    };

type DiffCellMode = "unified" | "old" | "new";

type DiffBlockProps = {
  diff: string;
    path?: string | null;
  language?: string | null;
  diffStyle?: DiffStyle;
  showHunkHeaders?: boolean;
  showLineNumbers?: boolean;
  onLineSelect?: (
    line: ParsedDiffLine,
    index: number,
    event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
  ) => void;
  selectedRange?: { start: number; end: number } | null;
  parsedLines?: ParsedDiffLine[] | null;
    onRevertHunk?: (hunkPatch: string) => void | Promise<void>;
};

function mapLineTypeAttribute(type: ParsedDiffLine["type"]) {
  if (type === "add") {
    return "change-addition";
  }
  if (type === "del") {
    return "change-deletion";
  }
  if (type === "context") {
    return "context";
  }
  return type;
}

function getLineNumber(line: ParsedDiffLine, mode: DiffCellMode) {
  if (mode === "old") {
    return line.oldLine ?? undefined;
  }
  if (mode === "new") {
    return line.newLine ?? undefined;
  }
  return line.newLine ?? line.oldLine ?? undefined;
}

function buildSplitRows(parsed: ParsedDiffLine[], hunkByLineIndex: Map<number, HunkAnchor>): SplitDiffRow[] {
  const rows: SplitDiffRow[] = [];
  let cursor = 0;

  while (cursor < parsed.length) {
    const line = parsed[cursor];
    if (!line) {
      cursor += 1;
      continue;
    }
    if (line.type === "hunk" || line.type === "meta") {
      cursor += 1;
      continue;
    }

    if (line.type === "context") {
      const entry = { index: cursor, line };
      rows.push({
        kind: "pair",
        key: `context-${cursor}`,
        left: entry,
        right: entry,
          hunkAnchor: hunkByLineIndex.get(cursor) ?? null,
      });
      cursor += 1;
      continue;
    }

    const deletions: IndexedDiffLine[] = [];
    const additions: IndexedDiffLine[] = [];

    if (line.type === "del") {
      while (cursor < parsed.length) {
        const currentLine = parsed[cursor];
        if (!currentLine || currentLine.type !== "del") {
          break;
        }
        deletions.push({ index: cursor, line: currentLine });
        cursor += 1;
      }
      while (cursor < parsed.length) {
        const currentLine = parsed[cursor];
        if (!currentLine || currentLine.type !== "add") {
          break;
        }
        additions.push({ index: cursor, line: currentLine });
        cursor += 1;
      }
    } else if (line.type === "add") {
      while (cursor < parsed.length) {
        const currentLine = parsed[cursor];
        if (!currentLine || currentLine.type !== "add") {
          break;
        }
        additions.push({ index: cursor, line: currentLine });
        cursor += 1;
      }
    } else {
      cursor += 1;
      continue;
    }

      const rowCount = deletions.length > 0 && additions.length > 0
          ? Math.min(deletions.length, additions.length)
          : Math.max(deletions.length, additions.length);
    for (let offset = 0; offset < rowCount; offset += 1) {
      const left = deletions[offset] ?? null;
      const right = additions[offset] ?? null;
        const rowHunkAnchor =
            (left ? hunkByLineIndex.get(left.index) : null)
            ?? (right ? hunkByLineIndex.get(right.index) : null)
            ?? null;
      rows.push({
        kind: "pair",
        key: `pair-${left?.index ?? "x"}-${right?.index ?? "x"}`,
        left,
        right,
          hunkAnchor: rowHunkAnchor,
      });
    }
  }

  return rows;
}

function toPatchPath(path: string) {
    return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function buildHunks(parsed: ParsedDiffLine[], path?: string | null): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    let currentHeader: string | null = null;
    let currentStartIndex: number | null = null;
    let currentAnchorIndex: number | null = null;
    let currentLines: ParsedDiffLine[] = [];
    const patchPath = path ? toPatchPath(path) : "file";

    const flush = () => {
        if (!currentHeader || currentStartIndex === null) {
            return;
        }
        const patchLines = [
            `diff --git a/${patchPath} b/${patchPath}`,
            `--- a/${patchPath}`,
            `+++ b/${patchPath}`,
            currentHeader,
            ...currentLines.map((line) => {
                switch (line.type) {
                    case "add":
                        return `+${line.text}`;
                    case "del":
                        return `-${line.text}`;
                    case "context":
                        return ` ${line.text}`;
                    case "meta":
                        return line.text;
                    default:
                        return line.text;
                }
            }),
        ];
        hunks.push({
            header: currentHeader,
            startIndex: currentStartIndex,
            anchorIndex: currentAnchorIndex,
            lines: currentLines,
            patch: `${patchLines.join("\n")}\n`,
        });
    };

    for (const [index, line] of parsed.entries()) {
        if (line.type === "hunk") {
            flush();
            currentHeader = line.text;
            currentStartIndex = index;
            currentAnchorIndex = null;
            currentLines = [];
            continue;
        }
        if (!currentHeader) {
            continue;
        }
        if (
            currentAnchorIndex === null &&
            (line.type === "add" || line.type === "del")
        ) {
            currentAnchorIndex = index;
        }
        currentLines.push(line);
    }

    flush();
    return hunks;
}

export function DiffBlock({
  diff,
                              path,
  language,
                              diffStyle = "split",
                              showHunkHeaders: _showHunkHeaders = true,
  showLineNumbers = true,
  onLineSelect,
  selectedRange = null,
  parsedLines = null,
                              onRevertHunk,
}: DiffBlockProps) {

  const parsed = useMemo(
    () => parsedLines ?? parseDiff(diff),
    [diff, parsedLines],
  );
  const visibleParsed = useMemo(
    () => parsed
      .map((line, index) => ({ index, line }))
        .filter(({line}) => line.type !== "hunk" && line.type !== "meta"),
      [parsed],
  );
    const hunks = useMemo(() => buildHunks(parsed, path), [parsed, path]);
    const hunkByLineIndex = useMemo(() => {
        const map = new Map<number, HunkAnchor>();
        for (const hunk of hunks) {
            const candidateIndexes = hunk.lines
                .filter((line) => line.type === "add" || line.type === "del" || line.type === "context")
                .map((line) => parsed.findIndex((candidate) => candidate === line))
                .filter((index) => index >= 0);
            const preferredAnchorIndex =
                candidateIndexes.find((index) => {
                    const line = parsed[index];
                    return line?.type === "add" || line?.type === "del";
                })
                ?? candidateIndexes[0]
                ?? null;
            for (const indexedLine of candidateIndexes) {
                map.set(indexedLine, {
                    hunk,
                    isAnchor: indexedLine === preferredAnchorIndex,
                });
            }
        }
        return map;
    }, [hunks, parsed]);
  const splitRows = useMemo(
      () => (diffStyle === "split" ? buildSplitRows(parsed, hunkByLineIndex) : []),
      [diffStyle, hunkByLineIndex, parsed],
  );
  const splitPaneEntries = useMemo(
    () => splitRows.map((row) => {
      if (row.kind === "header") {
        return {
          key: row.key,
          left: { line: row.line, mode: "unified" as const },
          right: { line: row.line, mode: "unified" as const },
            hunkAnchor: null,
        };
      }
      return {
        key: row.key,
        left: row.left ? { line: row.left, mode: "old" as const } : null,
        right: row.right ? { line: row.right, mode: "new" as const } : null,
          hunkAnchor: row.hunkAnchor,
      };
    }),
    [splitRows],
  );

  const renderDiffLine = (
    indexedLine: IndexedDiffLine,
    mode: DiffCellMode,
    key: string,
    options?: { allowHunkRevert?: boolean; hunkAnchor?: HunkAnchor | null },
  ) => {
    const { index, line } = indexedLine;
    const shouldHighlight =
      line.type === "add" || line.type === "del" || line.type === "context";
    const html = highlightLine(line.text, shouldHighlight ? language : null);
    const isSelectable = Boolean(onLineSelect) && shouldHighlight;
    const isSelected = Boolean(
      isSelectable &&
        selectedRange &&
        index >= selectedRange.start &&
        index <= selectedRange.end,
    );
    const isRangeStart = isSelected && selectedRange?.start === index;
    const isRangeEnd = isSelected && selectedRange?.end === index;
    const lineNumber = getLineNumber(line, mode);
      const hunkAnchor = options?.hunkAnchor ?? hunkByLineIndex.get(index) ?? null;
      const hunk = hunkAnchor?.hunk ?? null;
      const canRevertHunk = Boolean(
          options?.allowHunkRevert !== false
          && hunkAnchor?.isAnchor
          && hunk?.patch
          && (line.type === "add" || line.type === "del" || line.type === "context"),
      );

    return (
      <div
        key={key}
        className={`diff-line diff-line-${line.type}${mode !== "unified" ? " diff-line-split" : ""}${
          isSelectable ? " is-selectable" : ""
        }${isSelected ? " is-selected" : ""}${isRangeStart ? " is-range-start" : ""}${
          isRangeEnd ? " is-range-end" : ""
        }`}
        role={isSelectable ? "button" : undefined}
        tabIndex={isSelectable ? 0 : undefined}
        aria-pressed={isSelectable ? isSelected : undefined}
        data-line-type={mapLineTypeAttribute(line.type)}
        data-line={lineNumber}
        onClick={
          isSelectable
            ? (event) => {
                onLineSelect?.(line, index, event);
              }
            : undefined
        }
        onKeyDown={
          isSelectable
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onLineSelect?.(line, index, event);
                }
              }
            : undefined
        }
      >
        {showLineNumbers && (
          mode === "unified" ? (
            <div className="diff-gutter">
                {canRevertHunk ? (
                    <button
                        type="button"
                        className="diff-hunk-revert-button"
                        aria-label="回退"
                        data-tooltip="回退"
                        onClick={(event) => {
                            event.stopPropagation();
                            if (!hunk) {
                                return;
                            }
                            void onRevertHunk?.(hunk.patch);
                        }}
                    >
                        &gt;&gt;
                    </button>
                ) : (
                    <span className="diff-hunk-revert-spacer" aria-hidden/>
                )}
              <span className="diff-line-number">{line.oldLine ?? ""}</span>
              <span className="diff-line-number">{line.newLine ?? ""}</span>
            </div>
          ) : (
            <div className="diff-gutter diff-gutter-single">
                {canRevertHunk ? (
                    <button
                        type="button"
                        className="diff-hunk-revert-button"
                        aria-label="回退"
                        data-tooltip="回退"
                        onClick={(event) => {
                            event.stopPropagation();
                            if (!hunk) {
                                return;
                            }
                            void onRevertHunk?.(hunk.patch);
                        }}
                    >
                        &gt;&gt;
                    </button>
                ) : (
                    <span className="diff-hunk-revert-spacer" aria-hidden/>
                )}
              <span className="diff-line-number">{lineNumber ?? ""}</span>
            </div>
          )
        )}
        <div
          className="diff-line-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    );
  };

  const renderEmptyLine = (key: string) => (
    <div key={key} className="diff-line diff-line-empty diff-line-split" aria-hidden>
      {showLineNumbers && (
        <div className="diff-gutter diff-gutter-single">
            <span className="diff-hunk-revert-spacer" aria-hidden/>
          <span className="diff-line-number" />
        </div>
      )}
      <div className="diff-line-content" />
    </div>
  );

  if (diffStyle === "split") {
    return (
      <div className="diff-block-split">
        <div className="diff-split-pane diff-split-pane-old">
          <div className="diff-split-pane-content">
            {splitPaneEntries.map((entry) => (
              entry.left
                  ? renderDiffLine(entry.left.line, entry.left.mode, `left-${entry.key}`, {
                      allowHunkRevert: false,
                      hunkAnchor: entry.hunkAnchor,
                  })
                : renderEmptyLine(`left-empty-${entry.key}`)
            ))}
          </div>
        </div>
        <div className="diff-split-pane diff-split-pane-new">
          <div className="diff-split-pane-content">
            {splitPaneEntries.map((entry) => (
              entry.right
                  ? renderDiffLine(entry.right.line, entry.right.mode, `right-${entry.key}`, {
                      allowHunkRevert: true,
                      hunkAnchor: entry.hunkAnchor,
                  })
                : renderEmptyLine(`right-empty-${entry.key}`)
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="diff-block-unified">
      {visibleParsed.map((entry) => {
        return renderDiffLine(
          entry,
          "unified",
          `unified-${entry.index}`,
        );
      })}
    </div>
  );
}
