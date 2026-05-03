function stripAsciiControlChars(value: string) {
  let sanitized = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      sanitized += char;
    }
  }
  return sanitized;
}

export function looksLikeMarkdownDocument(output: string) {
  const trimmed = output.trim();
  if (!trimmed) return false;
  const hasHeading = /^#{1,6}\s+/m.test(trimmed);
  const hasInlineHeading = /(?:^|[^\w`])#{1,6}\s+\S+/.test(trimmed);
  const hasBulletList = /^\s*[-*+]\s+\S+/m.test(trimmed);
  const hasOrderedList = /^\s*\d+\.\s+\S+/m.test(trimmed);
  const hasQuote = /^\s*>+\s+\S+/m.test(trimmed);
  const hasFence = /```[\s\S]*```/.test(trimmed);
  const hasClassicTable =
    /^\s*\|.+\|\s*$/m.test(trimmed) && /^\s*\|?\s*[-:]{2,}/m.test(trimmed);
  const hasDenseTable = /\|[-:]{2,}\|/.test(trimmed) && /\|.+\|/.test(trimmed);

  if (
    hasHeading ||
    hasBulletList ||
    hasOrderedList ||
    hasQuote ||
    hasFence ||
    hasClassicTable
  ) {
    return true;
  }

  if (!trimmed.includes("\n")) {
    const denseSignals = [
      hasInlineHeading,
      hasDenseTable,
      /```/.test(trimmed),
      /(?:^|\s)(?:[-*+]|\d+\.)\s+\S+/.test(trimmed),
    ].filter(Boolean).length;
    if (denseSignals >= 2) {
      return true;
    }
  }
  return false;
}

export function normalizeDenseMarkdownOutput(output: string) {
  const trimmed = output.trim();
  if (!trimmed || trimmed.includes("\n")) {
    return output;
  }

  const hasDenseHeading = /#{1,6}\s*\S+/.test(trimmed);
  const hasDenseTable = /\|[-:]{2,}\|/.test(trimmed) && /\|.+\|/.test(trimmed);
  const hasDenseFence = /\\?`\\?`\\?`/.test(trimmed);
  const hasDenseList = /(?:^|\|)\s*(?:\d+\.\s+\S|[-*+]\s+\S)/.test(trimmed);
  if (!hasDenseHeading && !hasDenseTable && !hasDenseFence && !hasDenseList) {
    return output;
  }

  const isHeadingToken = (value: string) => /^#{1,6}\s+\S/.test(value);
  const isFenceToken = (value: string) => /^```[A-Za-z0-9_-]*$/.test(value);
  const isFenceStartToken = (value: string) => isFenceToken(value);
  const isFenceEndToken = (value: string) => value === "```";
  const isListToken = (value: string) => /^(?:\d+\.\s+\S|[-*+]\s+\S)/.test(value);
  const isSeparatorToken = (value: string) => /^:?-{3,}:?$/.test(value);
  const isPlaceholderCommandLine = (value: string) =>
    /^(\|?\s*)?命令(?:\s*\|\s*|\s+)command(\s*\|)?$/i.test(value.trim());
  const hasTreeGlyph = (value: string) => /[—─│├└┌┐]/.test(value);
  const looksLikeSectionLabel = (value: string) =>
    /^[\u4e00-\u9fffA-Za-z0-9（）()·:：_-]{2,20}$/.test(value) &&
    /[\u4e00-\u9fff]/.test(value) &&
    !/[/.]/.test(value) &&
    !/^https?:\/\//i.test(value);
  const looksLikeSectionBoundary = (current: string, next?: string) =>
    hasTreeGlyph(current) ||
    Boolean(next && hasTreeGlyph(next));

  const normalizeTextToken = (value: string) =>
    value
      .replace(/^\|+|\|+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  let normalized = trimmed
    .replace(/\\`\\`\\`/g, "```")
    .replace(/^-{2,}\s*(?=#)/, "")
    .replace(/(#{1,6})(?![#\s])(?=\S)/g, "$1 ")
    .replace(/```([A-Za-z0-9_-]*)/g, (_match, lang: string) => `|${"```"}${lang}|`)
    .replace(/([^|#])(?=#{1,6}\s)/g, "$1|")
    .replace(/([^|])(?=(?:\d+\.\s+\S|[-*+]\s+\S))/g, "$1|")
    .replace(/\|\|+/g, "|");
  normalized = stripAsciiControlChars(normalized);

  const fencePlaceholder = "__SESSION_ACTIVITY_FENCE__";
  normalized = normalized.replace(/```/g, fencePlaceholder);
  normalized = normalized.replace(/`+/g, "");
  normalized = normalized.replace(new RegExp(fencePlaceholder, "g"), "```");

  const tokens = normalized
    .split("|")
    .map((token) => normalizeTextToken(token))
    .filter((token) => token.length > 0 && !isPlaceholderCommandLine(token));

  const tryParseTable = (startIndex: number) => {
    let separatorStart = -1;
    const maxProbe = Math.min(tokens.length, startIndex + 8);
    for (let index = startIndex; index < maxProbe; index += 1) {
      const token = tokens[index] ?? "";
      if (isSeparatorToken(token)) {
        separatorStart = index;
        break;
      }
      if (index > startIndex && (isHeadingToken(token) || isFenceToken(token))) {
        return null;
      }
    }
    if (separatorStart <= startIndex) {
      return null;
    }

    let separatorEnd = separatorStart;
    while (separatorEnd < tokens.length && isSeparatorToken(tokens[separatorEnd] ?? "")) {
      separatorEnd += 1;
    }

    const header = tokens.slice(startIndex, separatorStart);
    const separatorCount = separatorEnd - separatorStart;
    const columnCount = header.length;
    if (columnCount < 2 || columnCount > 4 || separatorCount < columnCount) {
      return null;
    }
    if (header.some((cell) => isHeadingToken(cell) || isFenceToken(cell) || hasTreeGlyph(cell))) {
      return null;
    }

    const rows: string[] = [];
    let cursor = separatorEnd;
    while (cursor + columnCount <= tokens.length) {
      const candidate = tokens.slice(cursor, cursor + columnCount);
      if (candidate.some((cell) => isSeparatorToken(cell) || isFenceToken(cell) || isHeadingToken(cell))) {
        break;
      }
      if (looksLikeSectionBoundary(candidate[0] ?? "", candidate[1] ?? "")) {
        break;
      }
      if (
        columnCount === 2 &&
        looksLikeSectionLabel(candidate[0] ?? "") &&
        looksLikeSectionLabel(candidate[1] ?? "")
      ) {
        break;
      }
      rows.push(`| ${candidate.join(" | ")} |`);
      cursor += columnCount;
      if (
        cursor < tokens.length &&
        (isHeadingToken(tokens[cursor] ?? "") || isFenceToken(tokens[cursor] ?? ""))
      ) {
        break;
      }
    }

    if (rows.length === 0) {
      return null;
    }

    return {
      nextIndex: cursor,
      lines: [
        `| ${header.join(" | ")} |`,
        `| ${new Array(columnCount).fill("---").join(" | ")} |`,
        ...rows,
      ],
    };
  };

  const lines: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    const current = tokens[index];
    if (!current) {
      index += 1;
      continue;
    }

    if (isHeadingToken(current)) {
      lines.push(current);
      index += 1;
      continue;
    }

    if (isFenceStartToken(current)) {
      lines.push(current);
      index += 1;
      while (index < tokens.length && !isFenceEndToken(tokens[index] ?? "")) {
        lines.push(tokens[index] ?? "");
        index += 1;
      }
      if (index < tokens.length && isFenceEndToken(tokens[index] ?? "")) {
        lines.push("```");
        index += 1;
      } else if (lines[lines.length - 1] !== "```") {
        lines.push("```");
      }
      continue;
    }

    const table = tryParseTable(index);
    if (table) {
      lines.push(...table.lines);
      index = table.nextIndex;
      continue;
    }

    if (isListToken(current)) {
      lines.push(current);
      index += 1;
      continue;
    }

    if (
      index + 1 < tokens.length &&
      !hasTreeGlyph(current) &&
      hasTreeGlyph(tokens[index + 1] ?? "") &&
      !isHeadingToken(current)
    ) {
      lines.push(current);
      lines.push("```");
      index += 1;
      while (index < tokens.length) {
        const candidate = tokens[index];
        if (
          !candidate ||
          isHeadingToken(candidate) ||
          isFenceToken(candidate) ||
          isListToken(candidate) ||
          tryParseTable(index)
        ) {
          break;
        }
        lines.push(candidate.replace(/\|+/g, " ").replace(/\s{2,}/g, " ").trim());
        index += 1;
      }
      lines.push("```");
      continue;
    }

    if (hasTreeGlyph(current)) {
      lines.push(current.replace(/\|+/g, " ").replace(/\s{2,}/g, " ").trim());
      index += 1;
      continue;
    }

    const paragraphTokens: string[] = [];
    while (index < tokens.length) {
      const candidate = tokens[index];
      if (
        !candidate ||
        isHeadingToken(candidate) ||
        isFenceToken(candidate) ||
        isListToken(candidate) ||
        hasTreeGlyph(candidate) ||
        tryParseTable(index)
      ) {
        break;
      }
      paragraphTokens.push(candidate);
      index += 1;
    }

    if (paragraphTokens.length === 0) {
      lines.push(current);
      index += 1;
      continue;
    }

    lines.push(...paragraphTokens);
  }

  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}
