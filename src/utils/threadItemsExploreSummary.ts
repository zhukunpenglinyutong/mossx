import type { ConversationItem } from "../types";

const READ_COMMANDS = new Set(["cat", "sed", "head", "tail", "less", "more", "nl", "wc", "bat"]);
const LIST_COMMANDS = new Set(["ls", "tree", "find", "fd", "dir"]);
const SEARCH_COMMANDS = new Set(["rg", "grep", "ripgrep", "findstr", "ag", "ack"]);
const PATH_HINT_REGEX = /[\\/]/;
const PATHLIKE_REGEX = /(\.[a-z0-9]+$)|(^\.{1,2}$)/i;
const GLOB_HINT_REGEX = /[*?[\]{}]/;
const RG_FLAGS_WITH_VALUES = new Set([
  "-g",
  "--glob",
  "--iglob",
  "-t",
  "--type",
  "--type-add",
  "--type-not",
  "-m",
  "--max-count",
  "-A",
  "-B",
  "-C",
  "--context",
  "--max-depth",
]);

type ExploreEntry = Extract<ConversationItem, { kind: "explore" }>["entries"][number];
type ExploreItem = Extract<ConversationItem, { kind: "explore" }>;

function cleanCommandText(commandText: string) {
  if (!commandText) {
    return "";
  }
  const trimmed = commandText.trim();
  const posixShellMatch = trimmed.match(
    /^(?:\/\S+\/)?(?:bash|zsh|sh|fish)(?:\.exe)?\s+-lc\s+(?:(['"])([\s\S]+)\1|([\s\S]+))$/,
  );
  const powershellMatch = trimmed.match(
    /^(?:(?:[a-zA-Z]:)?[\\/][^\s]+[\\/])?(?:powershell|pwsh)(?:\.exe)?\s+[\s\S]*?(?:-command|-c)\s+(?:(['"])([\s\S]+)\1|([\s\S]+))$/i,
  );
  const cmdMatch = trimmed.match(
    /^(?:(?:[a-zA-Z]:)?[\\/][^\s]+[\\/])?cmd(?:\.exe)?\s+\/[cCkK]\s+(?:(['"])([\s\S]+)\1|([\s\S]+))$/,
  );
  const inner = posixShellMatch
    ? (posixShellMatch[2] ?? posixShellMatch[3] ?? "")
    : powershellMatch
      ? (powershellMatch[2] ?? powershellMatch[3] ?? "")
      : cmdMatch
        ? (cmdMatch[2] ?? cmdMatch[3] ?? "")
        : trimmed;
  const cdMatch = inner.match(/^\s*cd\s+[^&;]+(?:\s*&&\s*|\s*;\s*)([\s\S]+)$/i);
  const stripped = cdMatch?.[1] ?? inner;
  return stripped.trim();
}

function tokenizeCommand(command: string) {
  const tokens: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|`([^`]*)`|(\S+)/g;
  let match: RegExpExecArray | null = regex.exec(command);
  while (match) {
    const [, doubleQuoted, singleQuoted, backticked, bare] = match;
    const value = doubleQuoted ?? singleQuoted ?? backticked ?? bare ?? "";
    if (value) {
      tokens.push(value);
    }
    match = regex.exec(command);
  }
  return tokens;
}

function splitCommandSegments(command: string) {
  return command
    .split(/\s*(?:&&|;)\s*/g)
    .map((segment) => trimAtPipe(segment))
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function trimAtPipe(command: string) {
  if (!command) {
    return "";
  }
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char !== "|" || inSingle || inDouble) {
      continue;
    }
    const prev = index > 0 ? (command[index - 1] ?? "") : "";
    const next = index + 1 < command.length ? (command[index + 1] ?? "") : "";
    const prevIsSpace = prev === "" || /\s/.test(prev);
    const nextIsSpace = next === "" || /\s/.test(next);
    if (!prevIsSpace || !nextIsSpace) {
      continue;
    }
    return command.slice(0, index).trim();
  }
  return command.trim();
}

function isOptionToken(token: string) {
  return token.startsWith("-");
}

function isPathLike(token: string) {
  if (!token || isOptionToken(token)) {
    return false;
  }
  if (GLOB_HINT_REGEX.test(token)) {
    return false;
  }
  return PATH_HINT_REGEX.test(token) || PATHLIKE_REGEX.test(token);
}

function collectNonFlagOperands(tokens: string[], commandName: string) {
  const operands: string[] = [];
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
    if (isOptionToken(token)) {
      if (commandName === "rg" && RG_FLAGS_WITH_VALUES.has(token)) {
        index += 1;
      }
      continue;
    }
    operands.push(token);
  }
  return operands;
}

function findPathTokens(tokens: string[]) {
  const commandName = tokens[0]?.toLowerCase() ?? "";
  const positional = collectNonFlagOperands(tokens, commandName);
  const pathLike = positional.filter(isPathLike);
  return pathLike.length > 0 ? pathLike : positional;
}

function normalizeCommandStatus(status?: string) {
  const normalized = (status ?? "").toLowerCase();
  return /(pending|running|processing|started|in[_ -]?progress|inprogress)/.test(
    normalized,
  )
    ? "exploring"
    : "explored";
}

function isFailedStatus(status?: string) {
  const normalized = (status ?? "").toLowerCase();
  return /(fail|error)/.test(normalized);
}

function parseSearch(tokens: string[]): ExploreEntry | null {
  const commandName = tokens[0]?.toLowerCase() ?? "";
  const hasFilesFlag = tokens.some((token) => token === "--files");
  if ((tokens[0] ?? "") === "rg" && hasFilesFlag) {
    const paths = findPathTokens(tokens);
    const path = paths[paths.length - 1] || "rg --files";
    return { kind: "list", label: path };
  }
  const positional = collectNonFlagOperands(tokens, commandName);
  if (positional.length === 0) {
    return null;
  }
  const query = positional[0] ?? "";
  const rawPath = positional.length > 1 ? positional[1] : "";
  const path =
    commandName === "rg" ? rawPath : rawPath && isPathLike(rawPath) ? rawPath : "";
  const label = path ? `${query} in ${path}` : query;
  return { kind: "search", label };
}

function parseRead(tokens: string[]): ExploreEntry[] | null {
  const paths = findPathTokens(tokens).filter(Boolean);
  if (paths.length === 0) {
    return null;
  }
  const entries = paths.map((path) => {
    const name = path.split(/[\\/]/g).filter(Boolean).pop() ?? path;
    return name && name !== path
      ? ({ kind: "read", label: name, detail: path } satisfies ExploreEntry)
      : ({ kind: "read", label: path } satisfies ExploreEntry);
  });
  const seen = new Set<string>();
  const deduped: ExploreEntry[] = [];
  for (const entry of entries) {
    const key = entry.detail ? `${entry.label}|${entry.detail}` : entry.label;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function parseList(tokens: string[]): ExploreEntry {
  const paths = findPathTokens(tokens);
  const path = paths[paths.length - 1];
  return { kind: "list", label: path || tokens[0] || "list" };
}

function parseCommandSegment(command: string): ExploreEntry[] | null {
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) {
    return null;
  }
  const commandName = tokens[0]?.toLowerCase() ?? "";
  if (READ_COMMANDS.has(commandName)) {
    return parseRead(tokens);
  }
  if (LIST_COMMANDS.has(commandName)) {
    return [parseList(tokens)];
  }
  if (SEARCH_COMMANDS.has(commandName)) {
    const entry = parseSearch(tokens);
    return entry ? [entry] : null;
  }
  return null;
}

function coalesceReadEntries(entries: ExploreEntry[]) {
  const result: ExploreEntry[] = [];
  const seenReads = new Set<string>();

  for (const entry of entries) {
    if (entry.kind !== "read") {
      result.push(entry);
      continue;
    }
    const key = entry.detail ? `${entry.label}|${entry.detail}` : entry.label;
    if (seenReads.has(key)) {
      continue;
    }
    seenReads.add(key);
    result.push(entry);
  }
  return result;
}

function mergeExploreEntries(base: ExploreEntry[], next: ExploreEntry[]) {
  const merged = [...base, ...next];
  const seen = new Set<string>();
  const deduped: ExploreEntry[] = [];
  for (const entry of merged) {
    const key = `${entry.kind}|${entry.label}|${entry.detail ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function summarizeCommandExecution(item: Extract<ConversationItem, { kind: "tool" }>) {
  if (isFailedStatus(item.status)) {
    return null;
  }
  const title = typeof item.title === "string" ? item.title : "";
  const rawCommand = title.replace(/^Command:\s*/i, "").trim();
  const cleaned = cleanCommandText(rawCommand);
  if (!cleaned) {
    return null;
  }
  const segments = splitCommandSegments(cleaned);
  if (segments.length === 0) {
    return null;
  }
  const entries: ExploreEntry[] = [];
  for (const segment of segments) {
    const parsed = parseCommandSegment(segment);
    if (!parsed) {
      return null;
    }
    entries.push(...parsed);
  }
  if (entries.length === 0) {
    return null;
  }
  const coalescedEntries = coalesceReadEntries(entries);
  const status: ExploreItem["status"] = normalizeCommandStatus(item.status);
  const summary: ExploreItem = {
    id: item.id,
    kind: "explore",
    status,
    entries: coalescedEntries,
  };
  return summary;
}

export function summarizeExploration(items: ConversationItem[]) {
  const result: ConversationItem[] = [];

  for (const item of items) {
    if (item.kind === "explore") {
      const last = result[result.length - 1];
      if (last?.kind === "explore" && last.status === item.status) {
        result[result.length - 1] = {
          ...last,
          entries: mergeExploreEntries(last.entries, item.entries),
        };
        continue;
      }
      result.push(item);
      continue;
    }
    if (item.kind === "tool" && item.toolType === "commandExecution") {
      const summary = summarizeCommandExecution(item);
      if (!summary) {
        result.push(item);
        continue;
      }
      const last = result[result.length - 1];
      if (last?.kind === "explore" && last.status === summary.status) {
        result[result.length - 1] = {
          ...last,
          entries: mergeExploreEntries(last.entries, summary.entries),
        };
        continue;
      }
      result.push(summary);
      continue;
    }
    result.push(item);
  }
  return result;
}
