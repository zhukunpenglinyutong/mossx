import { Fragment, memo, useMemo, useRef, type ReactNode } from "react";

export const PROGRESSIVE_REVEAL_STEP_MS = 28;
export const PROGRESSIVE_REVEAL_CHUNK_CHARS = 360;
const PROGRESSIVE_REVEAL_MIN_CHARS = 96;
const PROGRESSIVE_REVEAL_SMALL_PENDING_CHARS = 140;
const PROGRESSIVE_REVEAL_MAX_CHARS = 3_072;
const PROGRESSIVE_REVEAL_MAX_STEP_MS = 112;
const PROGRESSIVE_REVEAL_LARGE_VISIBLE_CHARS = 3_000;
const PROGRESSIVE_REVEAL_HUGE_VISIBLE_CHARS = 8_000;
const PROGRESSIVE_REVEAL_MEDIUM_PENDING_CHARS = 1_200;
const PROGRESSIVE_REVEAL_LARGE_PENDING_CHARS = 3_000;
const PROGRESSIVE_REVEAL_IMMEDIATE_FLUSH_PENDING_CHARS = 6_000;
const PROGRESSIVE_REVEAL_IMMEDIATE_FLUSH_VISIBLE_CHARS = 8_000;

export type LightweightMarkdownLinkRenderer = (input: {
  href: string;
  children: ReactNode;
}) => ReactNode;

type LightweightMarkdownBlock =
  | { kind: "paragraph"; text: string; endOffset: number }
  | { kind: "list"; items: Array<{ text: string; ordered: boolean }>; endOffset: number }
  | { kind: "quote"; lines: string[]; endOffset: number }
  | {
    kind: "code";
    lines: string[];
    endOffset: number;
  }
  | {
    kind: "heading";
    level: 1 | 2 | 3 | 4 | 5 | 6;
    headingText: string;
    paragraphText: string | null;
    endOffset: number;
  };

const LightweightMarkdownBlockView = memo(function LightweightMarkdownBlockView({
  block,
  renderLink,
}: {
  block: LightweightMarkdownBlock;
  renderLink?: LightweightMarkdownLinkRenderer;
}) {
  if (block.kind === "paragraph") {
    return (
      <p>
        {renderInlineLightweightMarkdown(block.text, renderLink)}
      </p>
    );
  }
  if (block.kind === "list") {
    const ordered = block.items.every((item) => item.ordered);
    const children = block.items.map((item, index) => (
      <li key={`${block.endOffset}-li-${index}`}>
        {renderInlineLightweightMarkdown(item.text, renderLink)}
      </li>
    ));
    return ordered ? <ol>{children}</ol> : <ul>{children}</ul>;
  }
  if (block.kind === "quote") {
    return (
      <blockquote>
        <p>{renderInlineLightweightMarkdown(block.lines.join(" ").trim(), renderLink)}</p>
      </blockquote>
    );
  }
  if (block.kind === "code") {
    return (
      <pre>
        <code>{block.lines.join("\n")}</code>
      </pre>
    );
  }
  const headingChildren = renderInlineLightweightMarkdown(
    block.headingText,
    renderLink,
  );
  const headingNode = block.level === 1
    ? <h1>{headingChildren}</h1>
    : block.level === 2
      ? <h2>{headingChildren}</h2>
      : block.level === 3
        ? <h3>{headingChildren}</h3>
        : block.level === 4
          ? <h4>{headingChildren}</h4>
          : block.level === 5
            ? <h5>{headingChildren}</h5>
            : <h6>{headingChildren}</h6>;
  if (!block.paragraphText) {
    return headingNode;
  }
  return (
    <>
      {headingNode}
      <p>{renderInlineLightweightMarkdown(block.paragraphText, renderLink)}</p>
    </>
  );
}, (previous, next) => previous.block === next.block && previous.renderLink === next.renderLink);

export function normalizeProgressiveRevealStepMs(value: number) {
  return Number.isFinite(value)
    ? Math.max(0, value)
    : PROGRESSIVE_REVEAL_STEP_MS;
}

export function normalizeProgressiveRevealChunkChars(value: number) {
  return Number.isFinite(value)
    ? Math.max(PROGRESSIVE_REVEAL_MIN_CHARS, value)
    : PROGRESSIVE_REVEAL_CHUNK_CHARS;
}

function renderInlineLightweightMarkdown(
  text: string,
  renderLink?: LightweightMarkdownLinkRenderer,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(([^)]+)\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }
    const token = match[0];
    const key = `${match.index}-${token}`;
    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (!linkMatch) {
        nodes.push(token);
      } else {
        const linkChildren = linkMatch[1] ?? "";
        const renderedLink = renderLink?.({
          href: linkMatch[2] ?? "",
          children: linkChildren,
        }) ?? linkChildren;
        nodes.push(<Fragment key={key}>{renderedLink}</Fragment>);
      }
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

function splitLightweightHeadingContent(value: string) {
  const separatorMatch = value.match(/^(.{4,64}?[：:])\s*(.{12,})$/u);
  if (!separatorMatch) {
    return {
      headingText: value,
      paragraphText: null,
    };
  }
  return {
    headingText: (separatorMatch[1] ?? value).replace(/[：:]\s*$/u, ""),
    paragraphText: separatorMatch[2] ?? null,
  };
}

export function LightweightMarkdown({
  value,
  renderLink,
}: {
  value: string;
  renderLink?: LightweightMarkdownLinkRenderer;
}) {
  const parsedBlocksCacheRef = useRef<{
    value: string;
    blocks: LightweightMarkdownBlock[];
  }>({
    value: "",
    blocks: [],
  });
  const blocks = useMemo(() => {
    const normalizedValue = value.replace(/\r\n/g, "\n");
    const previousCache = parsedBlocksCacheRef.current;
    if (
      previousCache.blocks.length > 1 &&
      normalizedValue.length > previousCache.value.length &&
      normalizedValue.startsWith(previousCache.value)
    ) {
      const reusableBlocks = previousCache.blocks.slice(0, -1);
      const resumeOffset = reusableBlocks.at(-1)?.endOffset ?? 0;
      const reparsedTailBlocks = parseLightweightMarkdownBlocks(
        normalizedValue.slice(resumeOffset),
        resumeOffset,
      );
      const mergedBlocks = [...reusableBlocks, ...reparsedTailBlocks];
      parsedBlocksCacheRef.current = {
        value: normalizedValue,
        blocks: mergedBlocks,
      };
      return mergedBlocks;
    }
    const parsedBlocks = parseLightweightMarkdownBlocks(normalizedValue);
    parsedBlocksCacheRef.current = {
      value: normalizedValue,
      blocks: parsedBlocks,
    };
    return parsedBlocks;
  }, [value]);
  return (
    <>
      {blocks.map((block, index) => (
        <LightweightMarkdownBlockView
          key={`${block.kind}-${block.endOffset}-${index}`}
          block={block}
          renderLink={renderLink}
        />
      ))}
    </>
  );
}

function parseLightweightMarkdownBlocks(value: string, offsetBase = 0) {
  const lines = value.split("\n");
  const result: LightweightMarkdownBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: Array<{ text: string; ordered: boolean }> = [];
  let quoteLines: string[] = [];
  let codeLines: string[] | null = null;
  let lineOffset = offsetBase;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    const text = paragraphLines.join(" ").trim();
    if (text) {
      result.push({
        kind: "paragraph",
        text,
        endOffset: lineOffset,
      });
    }
    paragraphLines = [];
  };
  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    result.push({
      kind: "list",
      items: listItems,
      endOffset: lineOffset,
    });
    listItems = [];
  };
  const flushQuote = () => {
    if (quoteLines.length === 0) {
      return;
    }
    result.push({
      kind: "quote",
      lines: quoteLines,
      endOffset: lineOffset,
    });
    quoteLines = [];
  };
  const flushFlow = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (codeLines) {
        result.push({
          kind: "code",
          lines: codeLines,
          endOffset: lineOffset + line.length + 1,
        });
        codeLines = null;
      } else {
        flushFlow();
        codeLines = [];
      }
    } else if (codeLines) {
      codeLines.push(line);
    } else {
      const trimmed = line.trim();
      if (!trimmed) {
        flushFlow();
      } else {
        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          flushFlow();
          const headingContent = splitLightweightHeadingContent(headingMatch[2]);
          result.push({
            kind: "heading",
            level: headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
            headingText: headingContent.headingText,
            paragraphText: headingContent.paragraphText,
            endOffset: lineOffset + line.length + 1,
          });
        } else {
          const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/);
          const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
          if (unorderedMatch || orderedMatch) {
            flushParagraph();
            flushQuote();
            listItems.push({
              text: (unorderedMatch?.[1] ?? orderedMatch?.[1] ?? "").trim(),
              ordered: Boolean(orderedMatch),
            });
          } else if (trimmed.startsWith(">")) {
            flushParagraph();
            flushList();
            quoteLines.push(trimmed.replace(/^>\s?/, ""));
          } else {
            flushList();
            flushQuote();
            paragraphLines.push(trimmed);
          }
        }
      }
    }
    lineOffset += line.length + 1;
  }
  if (codeLines) {
    result.push({
      kind: "code",
      lines: codeLines,
      endOffset: offsetBase + value.length,
    });
  }
  flushFlow();
  return result;
}

function findProgressiveRevealBoundary(
  pendingText: string,
  preferredChars: number,
  maxChars: number,
) {
  const normalizedPreferredChars = normalizeProgressiveRevealChunkChars(preferredChars);
  const normalizedMaxChars = Math.max(
    normalizedPreferredChars,
    Math.min(
      Number.isFinite(maxChars) ? maxChars : PROGRESSIVE_REVEAL_MAX_CHARS,
      PROGRESSIVE_REVEAL_MAX_CHARS,
    ),
  );
  const searchEnd = Math.min(pendingText.length, normalizedMaxChars);
  const preferredEnd = Math.min(pendingText.length, normalizedPreferredChars);
  const candidateSlice = pendingText.slice(0, searchEnd);
  const boundaryPatterns = [
    /\n[^\S\r\n]*\n+/g,
    /\n(?=#{1,6}\s)/g,
    /\n(?=(?:[-*+]|\d+[.)])\s+)/g,
    /\n(?=>\s?)/g,
    /\n(?=```)/g,
    /\n/g,
  ];

  for (const pattern of boundaryPatterns) {
    let match: RegExpExecArray | null;
    let selectedBoundary = -1;
    while ((match = pattern.exec(candidateSlice)) !== null) {
      const boundary = match.index + match[0].length;
      if (boundary >= preferredEnd) {
        return boundary;
      }
      if (boundary >= PROGRESSIVE_REVEAL_MIN_CHARS) {
        selectedBoundary = boundary;
      }
    }
    if (selectedBoundary >= PROGRESSIVE_REVEAL_MIN_CHARS) {
      return selectedBoundary;
    }
  }

  return preferredEnd;
}

function resolveAdaptiveProgressiveRevealChunkChars(
  visibleLength: number,
  pendingLength: number,
  preferredChunkChars: number,
) {
  const normalizedChunkChars = normalizeProgressiveRevealChunkChars(preferredChunkChars);
  let adaptiveChunkChars = normalizedChunkChars;

  if (visibleLength >= PROGRESSIVE_REVEAL_HUGE_VISIBLE_CHARS) {
    adaptiveChunkChars = Math.max(adaptiveChunkChars, normalizedChunkChars * 4);
  } else if (visibleLength >= PROGRESSIVE_REVEAL_LARGE_VISIBLE_CHARS) {
    adaptiveChunkChars = Math.max(adaptiveChunkChars, normalizedChunkChars * 2);
  }

  if (pendingLength >= PROGRESSIVE_REVEAL_LARGE_PENDING_CHARS) {
    adaptiveChunkChars = Math.max(
      adaptiveChunkChars,
      Math.floor(pendingLength / 2),
    );
  } else if (pendingLength >= PROGRESSIVE_REVEAL_MEDIUM_PENDING_CHARS) {
    adaptiveChunkChars = Math.max(
      adaptiveChunkChars,
      Math.floor(pendingLength / 3),
    );
  }

  return Math.min(PROGRESSIVE_REVEAL_MAX_CHARS, adaptiveChunkChars);
}

export function resolveAdaptiveProgressiveRevealStepMs(
  visibleLength: number,
  pendingLength: number,
  preferredStepMs: number,
) {
  const normalizedStepMs = normalizeProgressiveRevealStepMs(preferredStepMs);
  let adaptiveStepMs = normalizedStepMs;

  if (visibleLength >= PROGRESSIVE_REVEAL_HUGE_VISIBLE_CHARS) {
    adaptiveStepMs = Math.max(adaptiveStepMs, normalizedStepMs * 2);
  } else if (visibleLength >= PROGRESSIVE_REVEAL_LARGE_VISIBLE_CHARS) {
    adaptiveStepMs = Math.max(adaptiveStepMs, Math.ceil(normalizedStepMs * 1.5));
  }

  if (pendingLength >= PROGRESSIVE_REVEAL_LARGE_PENDING_CHARS) {
    adaptiveStepMs = Math.max(adaptiveStepMs, normalizedStepMs * 2);
  } else if (pendingLength >= PROGRESSIVE_REVEAL_MEDIUM_PENDING_CHARS) {
    adaptiveStepMs = Math.max(adaptiveStepMs, Math.ceil(normalizedStepMs * 1.5));
  }

  return Math.min(PROGRESSIVE_REVEAL_MAX_STEP_MS, adaptiveStepMs);
}

export function resolveProgressiveRevealValue(
  visibleValue: string,
  targetValue: string,
  preferredChunkChars: number,
) {
  if (visibleValue === targetValue) {
    return visibleValue;
  }
  if (!targetValue.startsWith(visibleValue)) {
    return targetValue;
  }
  const pendingText = targetValue.slice(visibleValue.length);
  if (pendingText.length <= PROGRESSIVE_REVEAL_SMALL_PENDING_CHARS) {
    return targetValue;
  }
  if (
    visibleValue.length >= PROGRESSIVE_REVEAL_IMMEDIATE_FLUSH_VISIBLE_CHARS &&
    pendingText.length >= PROGRESSIVE_REVEAL_IMMEDIATE_FLUSH_PENDING_CHARS
  ) {
    return targetValue;
  }
  const adaptiveChunkChars = resolveAdaptiveProgressiveRevealChunkChars(
    visibleValue.length,
    pendingText.length,
    preferredChunkChars,
  );
  const boundary = findProgressiveRevealBoundary(
    pendingText,
    adaptiveChunkChars,
    Math.max(adaptiveChunkChars * 2, PROGRESSIVE_REVEAL_MIN_CHARS),
  );
  return targetValue.slice(0, visibleValue.length + boundary);
}
