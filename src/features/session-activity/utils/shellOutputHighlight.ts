import { highlightLine, languageFromPath } from "../../../utils/syntax";

const SHELL_COMMAND_SET = new Set([
  "ls",
  "cd",
  "pwd",
  "cat",
  "rg",
  "grep",
  "find",
  "tree",
  "sed",
  "awk",
  "head",
  "tail",
  "wc",
  "git",
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "npx",
  "node",
  "python",
  "python3",
  "zsh",
  "bash",
  "sh",
  "mkdir",
  "rm",
  "cp",
  "mv",
  "echo",
  "touch",
  "chmod",
  "chown",
  "ln",
  "sort",
  "uniq",
  "xargs",
  "cut",
  "tr",
  "which",
  "source",
]);

const MONTH_SET = new Set([
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
]);

type ShellTokenKind =
  | "command"
  | "flag"
  | "path"
  | "permission"
  | "number"
  | "time"
  | "env"
  | "url"
  | "plain";

type CommandOutputRenderMode = "shell" | "code" | "markdown";

type CommandOutputRenderMeta = {
  mode: CommandOutputRenderMode;
  language: string | null;
  filePath: string | null;
};

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdx"]);

const READ_COMMAND_SET = new Set([
  "cat",
  "nl",
  "sed",
  "head",
  "tail",
  "less",
  "more",
  "awk",
  "grep",
  "rg",
]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripWrappingQuotes(token: string) {
  if (token.length >= 2) {
    const first = token[0];
    const last = token[token.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return token.slice(1, -1);
    }
  }
  return token;
}

function normalizeCommandToken(token: string) {
  return stripWrappingQuotes(token.trim())
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

function tokenizeCommand(commandText: string) {
  return commandText.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}

function unwrapShellCommand(commandText: string) {
  let normalized = commandText.trim();
  const shellWrapperPattern =
    /^(?:\/\S+\/)?(?:bash|zsh|sh|fish)(?:\.exe)?\s+-lc\s+(?:(['"])([\s\S]+)\1|([\s\S]+))$/i;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const wrapperMatch = normalized.match(shellWrapperPattern);
    if (!wrapperMatch) {
      break;
    }
    normalized = (wrapperMatch[2] ?? wrapperMatch[3] ?? "").trim();
  }
  return normalized;
}

function stripShellPrelude(commandText: string) {
  let normalized = commandText.trim();
  const sourcePattern = /^\s*(?:source|\.)\s+~\/\.zshrc\s*(?:&&|;)\s*/i;
  const cdPattern = /^\s*cd\s+[^;&|]+(?:&&|;)\s*/i;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const next = normalized.replace(sourcePattern, "").replace(cdPattern, "").trim();
    if (next === normalized) {
      break;
    }
    normalized = next;
  }
  return normalized;
}

function splitCommandSegments(commandText: string) {
  return commandText
    .split(/\s*(?:&&|\|\||;|\|)\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function findReadCommandSegment(commandText: string) {
  const normalized = stripShellPrelude(unwrapShellCommand(commandText));
  const segments = splitCommandSegments(normalized);
  for (const segment of segments) {
    const tokens = tokenizeCommand(segment).map((token) => normalizeCommandToken(token));
    const primary = (tokens[0] ?? "").toLowerCase();
    if (READ_COMMAND_SET.has(primary)) {
      return segment;
    }
  }
  return normalized;
}

function extractCommandTokens(commandText: string) {
  return tokenizeCommand(commandText)
    .map((entry) => normalizeCommandToken(entry))
    .filter(Boolean);
}

function extractFilePathFromCommand(commandText: string) {
  const tokens = extractCommandTokens(findReadCommandSegment(commandText));
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!token || token.startsWith("-")) {
      continue;
    }
    if (
      token.includes("*") ||
      token.includes("?") ||
      token.includes("|") ||
      token.includes("&&") ||
      token.includes(";")
    ) {
      continue;
    }
    if (!isPathLike(token)) {
      continue;
    }
    return token;
  }
  return null;
}

function inferCommandPrimaryVerb(commandText: string) {
  const tokens = extractCommandTokens(findReadCommandSegment(commandText));
  return (tokens[0] ?? "").toLowerCase();
}

function looksLikeMarkdownDocument(output: string) {
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

  // Some command outputs flatten markdown into a single line.
  // Accept those only when there are multiple markdown signals.
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

export function normalizeCommandMarkdownOutput(output: string) {
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
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/^-{2,}\s*(?=#)/, "")
    .replace(/(#{1,6})(?![#\s])(?=\S)/g, "$1 ")
    .replace(/```([A-Za-z0-9_-]*)/g, (_match, lang: string) => `|${"```"}${lang}|`)
    .replace(/([^|#])(?=#{1,6}\s)/g, "$1|")
    .replace(/([^|])(?=(?:\d+\.\s+\S|[-*+]\s+\S))/g, "$1|")
    .replace(/\|\|+/g, "|");

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
      if (isSeparatorToken(tokens[index])) {
        separatorStart = index;
        break;
      }
      if (index > startIndex && (isHeadingToken(tokens[index]) || isFenceToken(tokens[index]))) {
        return null;
      }
    }
    if (separatorStart <= startIndex) {
      return null;
    }

    let separatorEnd = separatorStart;
    while (separatorEnd < tokens.length && isSeparatorToken(tokens[separatorEnd])) {
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
      if (looksLikeSectionBoundary(candidate[0], candidate[1])) {
        break;
      }
      if (
        columnCount === 2 &&
        looksLikeSectionLabel(candidate[0]) &&
        looksLikeSectionLabel(candidate[1])
      ) {
        break;
      }
      rows.push(`| ${candidate.join(" | ")} |`);
      cursor += columnCount;
      if (cursor < tokens.length && (isHeadingToken(tokens[cursor]) || isFenceToken(tokens[cursor]))) {
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
      while (index < tokens.length && !isFenceEndToken(tokens[index])) {
        lines.push(tokens[index]);
        index += 1;
      }
      if (index < tokens.length && isFenceEndToken(tokens[index])) {
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
      hasTreeGlyph(tokens[index + 1]) &&
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

export function inferCommandOutputRenderMeta(commandText: string | undefined, output: string): CommandOutputRenderMeta {
  const normalizedCommand = (commandText ?? "").trim();
  if (!normalizedCommand) {
    return { mode: "shell", language: null, filePath: null };
  }

  const filePath = extractFilePathFromCommand(normalizedCommand);
  const primaryVerb = inferCommandPrimaryVerb(normalizedCommand);
  const language = filePath ? languageFromPath(filePath) : null;
  const extension = filePath?.split(".").pop()?.toLowerCase() ?? "";

  if (filePath && MARKDOWN_EXTENSIONS.has(extension)) {
    return { mode: "markdown", language: null, filePath };
  }

  if (filePath && language && READ_COMMAND_SET.has(primaryVerb)) {
    return { mode: "code", language, filePath };
  }

  if (!filePath && looksLikeMarkdownDocument(output)) {
    return { mode: "markdown", language: null, filePath: null };
  }

  return { mode: "shell", language: null, filePath };
}

function isPathLike(token: string) {
  const normalized = token.trim();
  if (!normalized) return false;
  if (normalized === "." || normalized === "..") return true;
  if (/^[A-Za-z]:[\\/]/.test(normalized)) return true;
  if (normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../") || normalized.startsWith("~/")) {
    return true;
  }
  if (normalized.includes("/") || normalized.includes("\\")) {
    return true;
  }
  if (normalized.startsWith(".")) {
    return true;
  }
  return /\.[A-Za-z0-9]{1,16}$/.test(normalized);
}

function classifyShellToken(rawToken: string): ShellTokenKind {
  const token = stripWrappingQuotes(rawToken);
  const lower = token.toLowerCase();
  if (!token) return "plain";
  if (/^https?:\/\/\S+$/i.test(token)) return "url";
  if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(token)) return "env";
  if (/^[bcdlps-][rwxstST-]{9}$/i.test(token)) return "permission";
  if (SHELL_COMMAND_SET.has(lower)) return "command";
  if (/^--?[A-Za-z0-9][\w-]*$/.test(token)) return "flag";
  if (MONTH_SET.has(lower) || /^\d{1,2}:\d{2}(?::\d{2})?$/.test(token) || /^\d{4}-\d{2}-\d{2}$/.test(token)) {
    return "time";
  }
  if (/^\d+(?:\.\d+)?[KMGTP]?$/i.test(token)) return "number";
  if (isPathLike(token)) return "path";
  return "plain";
}

function renderShellToken(token: string, kind: ShellTokenKind) {
  const escaped = escapeHtml(token);
  if (kind === "plain") {
    return escaped;
  }
  return `<span class="session-activity-shell-token-${kind}">${escaped}</span>`;
}

function renderLine(line: string) {
  if (!line.trim()) {
    return "&nbsp;";
  }
  if (/\b(error|failed|exception|traceback|fatal)\b/i.test(line)) {
    return `<span class="session-activity-command-line-error">${escapeHtml(line)}</span>`;
  }
  return line
    .split(/(\s+)/)
    .map((fragment) => {
      if (!fragment) return "";
      if (/^\s+$/.test(fragment)) return fragment;
      return renderShellToken(fragment, classifyShellToken(fragment));
    })
    .join("");
}

export function renderShellOutputHtml(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => renderLine(line))
    .join("\n");
}

export function renderCodeOutputHtml(output: string, language: string | null) {
  return output
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) {
        return "&nbsp;";
      }
      const numberedLineMatch = line.match(/^(\s*\d+)(\s+)([\s\S]*)$/);
      if (numberedLineMatch) {
        const highlighted = highlightLine(numberedLineMatch[3], language);
        return `<span class="session-activity-code-line-number">${numberedLineMatch[1]}</span>${numberedLineMatch[2]}${highlighted}`;
      }
      return highlightLine(line, language);
    })
    .join("\n");
}
