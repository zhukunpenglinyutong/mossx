import { highlightLine, languageFromPath } from "../../../utils/syntax";
import { looksLikeMarkdownDocument, normalizeDenseMarkdownOutput } from "../../../utils/denseMarkdownOutput";

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

export function normalizeCommandMarkdownOutput(output: string) {
  return normalizeDenseMarkdownOutput(output);
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
        const highlighted = highlightLine(numberedLineMatch[3] ?? "", language);
        return `<span class="session-activity-code-line-number">${numberedLineMatch[1] ?? ""}</span>${numberedLineMatch[2] ?? ""}${highlighted}`;
      }
      return highlightLine(line, language);
    })
    .join("\n");
}
