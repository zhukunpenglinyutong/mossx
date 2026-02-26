import type { KeyboardEvent, MouseEvent } from "react";
import { useMemo } from "react";
import { parseDiff, type ParsedDiffLine } from "../../../utils/diff";
import { highlightLine } from "../../../utils/syntax";

type DiffStyle = "split" | "unified";

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
    };

type DiffCellMode = "unified" | "old" | "new";

type DiffBlockProps = {
  diff: string;
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

function buildSplitRows(
  parsed: ParsedDiffLine[],
  showHunkHeaders: boolean,
): SplitDiffRow[] {
  const rows: SplitDiffRow[] = [];
  let cursor = 0;

  while (cursor < parsed.length) {
    const line = parsed[cursor];
    if (line.type === "hunk" || line.type === "meta") {
      if (showHunkHeaders) {
        rows.push({
          kind: "header",
          key: `header-${cursor}`,
          line: { index: cursor, line },
        });
      }
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
      });
      cursor += 1;
      continue;
    }

    const deletions: IndexedDiffLine[] = [];
    const additions: IndexedDiffLine[] = [];

    if (line.type === "del") {
      while (cursor < parsed.length && parsed[cursor].type === "del") {
        deletions.push({ index: cursor, line: parsed[cursor] });
        cursor += 1;
      }
      while (cursor < parsed.length && parsed[cursor].type === "add") {
        additions.push({ index: cursor, line: parsed[cursor] });
        cursor += 1;
      }
    } else if (line.type === "add") {
      while (cursor < parsed.length && parsed[cursor].type === "add") {
        additions.push({ index: cursor, line: parsed[cursor] });
        cursor += 1;
      }
    } else {
      cursor += 1;
      continue;
    }

    const rowCount = Math.max(deletions.length, additions.length);
    for (let offset = 0; offset < rowCount; offset += 1) {
      const left = deletions[offset] ?? null;
      const right = additions[offset] ?? null;
      rows.push({
        kind: "pair",
        key: `pair-${left?.index ?? "x"}-${right?.index ?? "x"}`,
        left,
        right,
      });
    }
  }

  return rows;
}

export function DiffBlock({
  diff,
  language,
  diffStyle = "unified",
  showHunkHeaders = true,
  showLineNumbers = true,
  onLineSelect,
  selectedRange = null,
  parsedLines = null,
}: DiffBlockProps) {
  const parsed = useMemo(
    () => parsedLines ?? parseDiff(diff),
    [diff, parsedLines],
  );
  const visibleParsed = useMemo(
    () => parsed
      .map((line, index) => ({ index, line }))
      .filter(({ line }) => showHunkHeaders || (line.type !== "hunk" && line.type !== "meta")),
    [parsed, showHunkHeaders],
  );
  const splitRows = useMemo(
    () => (diffStyle === "split" ? buildSplitRows(parsed, showHunkHeaders) : []),
    [diffStyle, parsed, showHunkHeaders],
  );
  const splitPaneEntries = useMemo(
    () => splitRows.map((row) => {
      if (row.kind === "header") {
        return {
          key: row.key,
          left: { line: row.line, mode: "unified" as const },
          right: { line: row.line, mode: "unified" as const },
        };
      }
      return {
        key: row.key,
        left: row.left ? { line: row.left, mode: "old" as const } : null,
        right: row.right ? { line: row.right, mode: "new" as const } : null,
      };
    }),
    [splitRows],
  );

  const renderDiffLine = (
    indexedLine: IndexedDiffLine,
    mode: DiffCellMode,
    key: string,
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
              <span className="diff-line-number">{line.oldLine ?? ""}</span>
              <span className="diff-line-number">{line.newLine ?? ""}</span>
            </div>
          ) : (
            <div className="diff-gutter diff-gutter-single">
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
                ? renderDiffLine(entry.left.line, entry.left.mode, `left-${entry.key}`)
                : renderEmptyLine(`left-empty-${entry.key}`)
            ))}
          </div>
        </div>
        <div className="diff-split-pane diff-split-pane-new">
          <div className="diff-split-pane-content">
            {splitPaneEntries.map((entry) => (
              entry.right
                ? renderDiffLine(entry.right.line, entry.right.mode, `right-${entry.key}`)
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
