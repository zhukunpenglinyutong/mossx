import type { ConversationItem, EngineType } from "../../../types";
import type { ClaudeRewindPreviewState } from "../components/ClaudeRewindConfirmDialog";
import {
  extractFileChangeSummaries,
  type OperationFileChangeSummary,
} from "../../operation-facts/operationFacts";

export type RewindFileChangeStatus = OperationFileChangeSummary["status"];

export type InlineFileReferenceSelection = {
  id: string;
  icon: "📁" | "📄";
  label: string;
  path: string;
};

const INLINE_FILE_REFERENCE_TOKEN_REGEX =
  /(📁|📄)\s+([^\n`📁📄]+?)\s+`([^`\n]+)`/gu;
const INLINE_AT_FILE_REFERENCE_REGEX =
  /@(?:"([^"\n]+)"|'([^'\n]+)'|`([^`\n]+)`|([^\s@]+))/gu;
const DELETE_FILE_INTENT_REGEX =
  /(删除|删掉|移除|remove|delete|unlink)/i;
const CREATE_FILE_INTENT_REGEX =
  /(创建|新建|新增|create|add)/i;
const RENAME_FILE_INTENT_REGEX =
  /(重命名|rename|move)/i;
const MODIFY_FILE_INTENT_REGEX =
  /(修改|改|更新|注释|edit|patch|update)/i;
const READ_ONLY_FILE_INTENT_REGEX =
  /(读取|查看|看看|阅读|read|open|cat|search|grep|find|list|scan|inspect)/i;
const REWIND_MUTATION_TOOL_HINT_REGEX =
  /(edit|replace|write|patch|apply|delete|remove|unlink|rename|move|create|add)/i;
const REWIND_READ_ONLY_TOOL_HINT_REGEX =
  /(read|view|cat|search|grep|glob|find|list|ls|scan|inspect)/i;
const REWIND_PREVIEW_MAX_CHARS = 72;

type RewindCandidate = {
  id: string;
  index: number;
  preview: string;
};

type RewindThreadContext = {
  engine: "claude" | "codex" | "gemini";
  sessionId: string | null;
  conversationLabel: string;
};

type MentionedPathInMessage = {
  path: string;
  dedupeKey: string;
  start: number;
  end: number;
};

export function resolveRewindSupportedEngineFromThreadId(
  activeThreadId: string | null | undefined,
): "claude" | "codex" | null {
  const normalized = activeThreadId?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("claude:")) {
    return "claude";
  }
  if (normalized.startsWith("codex:")) {
    return "codex";
  }
  if (
    normalized.startsWith("claude-pending-") ||
    normalized.startsWith("codex-pending-") ||
    normalized.startsWith("gemini:") ||
    normalized.startsWith("gemini-pending-") ||
    normalized.startsWith("opencode:") ||
    normalized.startsWith("opencode-pending-")
  ) {
    return null;
  }
  if (normalized.includes(":")) {
    return null;
  }
  return "codex";
}

function truncateRewindPreview(text: string) {
  if (text.length <= REWIND_PREVIEW_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, REWIND_PREVIEW_MAX_CHARS - 1)}…`;
}

function collectRewindCandidates(items: ConversationItem[]): RewindCandidate[] {
  const candidates: RewindCandidate[] = [];
  const seen = new Set<string>();
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind !== "message" || item.role !== "user") {
      continue;
    }
    const id = item.id.trim();
    if (!id || id.startsWith("optimistic-user-") || seen.has(id)) {
      continue;
    }
    const preview = truncateRewindPreview(
      item.text.replace(/\s+/g, " ").trim(),
    );
    candidates.push({
      id,
      index,
      preview: preview || id,
    });
    seen.add(id);
  }
  return candidates;
}

function getFileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? filePath;
}

export function normalizeRewindExportPath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/");
}

function isWindowsLikeRewindPath(rawPath: string, normalizedPath: string): boolean {
  if (rawPath.includes("\\")) {
    return true;
  }
  if (/^[A-Za-z]:\//.test(normalizedPath)) {
    return true;
  }
  if (/^\/\/[^/]+\/[^/]+/.test(normalizedPath)) {
    return true;
  }
  return /^\/mnt\/[A-Za-z]\//.test(normalizedPath);
}

export function toRewindPathDedupeKey(filePath: string): string {
  const normalizedPath = normalizeRewindExportPath(filePath);
  if (!normalizedPath) {
    return "";
  }
  if (isWindowsLikeRewindPath(filePath, normalizedPath)) {
    return normalizedPath.toLowerCase();
  }
  return normalizedPath;
}

function isLikelyFilePathToken(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(normalized)) {
    return false;
  }
  if (
    normalized.startsWith("/") ||
    normalized.startsWith("./") ||
    normalized.startsWith("../") ||
    /^[A-Za-z]:[\\/]/.test(normalized)
  ) {
    return true;
  }
  if (normalized.includes("/") || normalized.includes("\\")) {
    return true;
  }
  return /\.[A-Za-z0-9]{1,16}$/.test(normalized);
}

function normalizeMentionPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed
    .replace(/^[("'`]+/, "")
    .replace(/[)"'`,;:.!?]+$/, "")
    .trim();
}

function inferMessageFileStatus(
  text: string,
): OperationFileChangeSummary["status"] | null {
  if (DELETE_FILE_INTENT_REGEX.test(text)) {
    return "D";
  }
  if (RENAME_FILE_INTENT_REGEX.test(text)) {
    return "R";
  }
  if (CREATE_FILE_INTENT_REGEX.test(text)) {
    return "A";
  }
  if (MODIFY_FILE_INTENT_REGEX.test(text)) {
    return "M";
  }
  return null;
}

function inferSegmentFileStatus(
  text: string,
): OperationFileChangeSummary["status"] | null {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }
  if (DELETE_FILE_INTENT_REGEX.test(normalized)) {
    return "D";
  }
  if (RENAME_FILE_INTENT_REGEX.test(normalized)) {
    return "R";
  }
  if (CREATE_FILE_INTENT_REGEX.test(normalized)) {
    return "A";
  }
  if (MODIFY_FILE_INTENT_REGEX.test(normalized)) {
    return "M";
  }
  return null;
}

function hasReadOnlyFileIntent(text: string): boolean {
  return READ_ONLY_FILE_INTENT_REGEX.test(text.trim());
}

function extractLeadingIntentClause(text: string): string {
  const normalized = text.trimStart();
  const separatorIndex = normalized.search(/[，,。.;；!?！？\n]/);
  if (separatorIndex < 0) {
    return normalized;
  }
  return normalized.slice(0, separatorIndex);
}

function extractTrailingIntentClause(text: string): string {
  const normalized = text.trimEnd();
  const separatorMatches = Array.from(
    normalized.matchAll(/[，,。.;；!?！？\n]/g),
  );
  const lastSeparator = separatorMatches.at(-1);
  if (!lastSeparator || lastSeparator.index === undefined) {
    return normalized;
  }
  return normalized.slice(lastSeparator.index + lastSeparator[0].length);
}

export function resolvePreferredStatus(
  current: RewindFileChangeStatus,
  incoming: RewindFileChangeStatus,
): RewindFileChangeStatus {
  const priority: Record<RewindFileChangeStatus, number> = {
    D: 4,
    R: 3,
    A: 2,
    M: 1,
  };
  return priority[incoming] > priority[current] ? incoming : current;
}

function extractMentionedPathsFromMessage(
  text: string,
): MentionedPathInMessage[] {
  if (!text.trim()) {
    return [];
  }
  const paths: MentionedPathInMessage[] = [];
  const seen = new Set<string>();

  text.replace(
    INLINE_FILE_REFERENCE_TOKEN_REGEX,
    (
      full,
      _icon: string,
      _name: string,
      fullPathRaw: string,
      offset: number,
    ) => {
      const normalized = normalizeMentionPath(fullPathRaw);
      if (!normalized || !isLikelyFilePathToken(normalized)) {
        return full;
      }
      const dedupeKey = toRewindPathDedupeKey(normalized);
      if (!dedupeKey) {
        return full;
      }
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        paths.push({
          path: normalized,
          dedupeKey,
          start: offset,
          end: offset + full.length,
        });
      }
      return full;
    },
  );

  const matches = text.matchAll(INLINE_AT_FILE_REFERENCE_REGEX);
  for (const match of matches) {
    const rawToken = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    const normalized = normalizeMentionPath(rawToken);
    if (!normalized || !isLikelyFilePathToken(normalized)) {
      continue;
    }
    const dedupeKey = toRewindPathDedupeKey(normalized);
    if (!dedupeKey) {
      continue;
    }
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    const start = match.index ?? 0;
    const raw = match[0] ?? normalized;
    paths.push({
      path: normalized,
      dedupeKey,
      start,
      end: start + raw.length,
    });
  }

  return paths.sort((left, right) => left.start - right.start);
}

function extractFallbackAffectedFilesFromImpactedMessages(
  items: ConversationItem[],
): OperationFileChangeSummary[] {
  const byPath = new Map<string, OperationFileChangeSummary>();
  for (const item of items) {
    if (item.kind !== "message" || item.role !== "user") {
      continue;
    }
    const mentions = extractMentionedPathsFromMessage(item.text);
    if (mentions.length === 0) {
      continue;
    }
    const messageLevelStatus = inferMessageFileStatus(item.text);
    mentions.forEach((mention, index) => {
      const previousEnd = index > 0 ? mentions[index - 1]?.end ?? 0 : 0;
      const nextStart =
        index + 1 < mentions.length
          ? mentions[index + 1]?.start ?? item.text.length
          : item.text.length;
      const beforeSegment = extractTrailingIntentClause(
        item.text.slice(previousEnd, mention.start),
      );
      const afterSegment = extractLeadingIntentClause(
        item.text.slice(mention.end, nextStart),
      );
      const beforeStatus = inferSegmentFileStatus(beforeSegment);
      const afterStatus = inferSegmentFileStatus(afterSegment);
      const beforeHasReadOnlyIntent = hasReadOnlyFileIntent(beforeSegment);
      const afterHasReadOnlyIntent = hasReadOnlyFileIntent(afterSegment);
      const status = (() => {
        if (beforeStatus) {
          return beforeStatus;
        }
        if (beforeHasReadOnlyIntent) {
          return null;
        }
        if (afterStatus) {
          return afterStatus;
        }
        if (afterHasReadOnlyIntent) {
          return null;
        }
        return messageLevelStatus;
      })();
      if (!status) {
        return;
      }
      const normalizedPath = normalizeRewindExportPath(mention.path);
      const dedupeKey = mention.dedupeKey;
      if (!normalizedPath || !dedupeKey) {
        return;
      }
      const existing = byPath.get(dedupeKey);
      if (!existing) {
        byPath.set(dedupeKey, {
          filePath: normalizedPath,
          fileName: getFileNameFromPath(normalizedPath),
          status,
          additions: 0,
          deletions: 0,
        });
        return;
      }
      existing.status = resolvePreferredStatus(existing.status, status);
    });
  }
  return Array.from(byPath.values());
}

function isMutationToolItem(
  item: Extract<ConversationItem, { kind: "tool" }>,
): boolean {
  if ((item.changes?.length ?? 0) > 0) {
    return true;
  }
  const normalizedToolType =
    typeof item.toolType === "string" ? item.toolType.trim().toLowerCase() : "";
  if (normalizedToolType === "filechange") {
    return true;
  }
  if (isReadOnlyToolItem(item)) {
    return false;
  }
  if (normalizedToolType === "commandexecution" || normalizedToolType === "bash") {
    return true;
  }
  return REWIND_MUTATION_TOOL_HINT_REGEX.test(
    `${item.title}\n${item.detail}\n${item.output ?? ""}`,
  );
}

function isReadOnlyToolItem(
  item: Extract<ConversationItem, { kind: "tool" }>,
): boolean {
  const candidateText = `${item.title}\n${item.detail}\n${item.output ?? ""}`;
  return REWIND_READ_ONLY_TOOL_HINT_REGEX.test(candidateText);
}

function shouldUseFallbackAffectedFiles(
  items: ConversationItem[],
): boolean {
  const toolItems = items.filter(
    (item): item is Extract<ConversationItem, { kind: "tool" }> =>
      item.kind === "tool",
  );
  if (toolItems.length === 0) {
    return false;
  }
  return toolItems.some((item) => !isReadOnlyToolItem(item));
}

function extractMutationAffectedFilesFromTools(
  items: ConversationItem[],
): OperationFileChangeSummary[] {
  return extractFileChangeSummaries(
    items.filter(
      (item): item is Extract<ConversationItem, { kind: "tool" }> =>
        item.kind === "tool" && isMutationToolItem(item),
    ),
  );
}

function mergeRewindAffectedFiles(
  toolFiles: OperationFileChangeSummary[],
  fallbackFiles: OperationFileChangeSummary[],
): OperationFileChangeSummary[] {
  const mergedByKey = new Map<string, OperationFileChangeSummary>();

  const normalizeForMerge = (file: OperationFileChangeSummary) => {
    const normalizedPath = normalizeRewindExportPath(file.filePath);
    const dedupeKey = toRewindPathDedupeKey(normalizedPath);
    if (!normalizedPath || !dedupeKey) {
      return null;
    }
    return {
      dedupeKey,
      file: {
        ...file,
        filePath: normalizedPath,
        fileName: file.fileName?.trim() || getFileNameFromPath(normalizedPath),
      } satisfies OperationFileChangeSummary,
    };
  };

  for (const sourceFile of toolFiles) {
    const normalized = normalizeForMerge(sourceFile);
    if (!normalized) {
      continue;
    }
    const existing = mergedByKey.get(normalized.dedupeKey);
    if (!existing) {
      mergedByKey.set(normalized.dedupeKey, normalized.file);
      continue;
    }
    existing.status = resolvePreferredStatus(existing.status, normalized.file.status);
    existing.additions = Math.max(existing.additions, normalized.file.additions);
    existing.deletions = Math.max(existing.deletions, normalized.file.deletions);
    if (!existing.diff && normalized.file.diff) {
      existing.diff = normalized.file.diff;
    }
  }

  for (const sourceFile of fallbackFiles) {
    const normalized = normalizeForMerge(sourceFile);
    if (!normalized) {
      continue;
    }
    const existing = mergedByKey.get(normalized.dedupeKey);
    if (!existing) {
      mergedByKey.set(normalized.dedupeKey, normalized.file);
      continue;
    }
    existing.status = resolvePreferredStatus(existing.status, normalized.file.status);
  }

  return Array.from(mergedByKey.values()).map((file) => ({
    ...file,
    filePath: normalizeRewindExportPath(file.filePath),
    fileName: file.fileName?.trim() || getFileNameFromPath(file.filePath),
  }));
}

function resolveRewindThreadContext(
  activeThreadId: string | null | undefined,
  fallbackEngine: EngineType | null | undefined,
  fallbackLabel: string,
): RewindThreadContext {
  const normalizedThreadId = activeThreadId?.trim() ?? "";
  const rewindEngineFromThreadId =
    resolveRewindSupportedEngineFromThreadId(normalizedThreadId);
  const [rawEngine = "", ...sessionParts] = normalizedThreadId.split(":");
  const hasKnownEnginePrefix =
    rawEngine === "claude" || rawEngine === "codex" || rawEngine === "gemini";
  const normalizedEngine = (() => {
    if (rewindEngineFromThreadId) {
      return rewindEngineFromThreadId;
    }
    if (rawEngine === "gemini") {
      return "gemini";
    }
    if (
      !normalizedThreadId &&
      (fallbackEngine === "claude" ||
        fallbackEngine === "codex" ||
        fallbackEngine === "gemini")
    ) {
      return fallbackEngine;
    }
    return "codex";
  })();
  const sessionId = hasKnownEnginePrefix
    ? sessionParts.join(":").trim() || null
    : normalizedThreadId || null;
  return {
    engine: normalizedEngine,
    sessionId,
    conversationLabel: fallbackLabel.trim() || "rewind",
  };
}

export function buildLatestRewindPreview(
  items: ConversationItem[],
  activeThreadId?: string | null,
  fallbackEngine?: EngineType | null,
): ClaudeRewindPreviewState | null {
  const latestCandidate = collectRewindCandidates(items)[0];
  if (!latestCandidate) {
    return null;
  }

  const impactedItems = items.slice(latestCandidate.index);
  const affectedFilesFromTools = extractMutationAffectedFilesFromTools(
    impactedItems,
  );
  const fallbackAffectedFiles =
    shouldUseFallbackAffectedFiles(impactedItems)
      ? extractFallbackAffectedFilesFromImpactedMessages(impactedItems)
      : [];
  const affectedFiles = mergeRewindAffectedFiles(
    affectedFilesFromTools,
    fallbackAffectedFiles,
  );
  const threadContext = resolveRewindThreadContext(
    activeThreadId,
    fallbackEngine,
    latestCandidate.preview,
  );
  return {
    targetMessageId: latestCandidate.id,
    preview: latestCandidate.preview,
    engine: threadContext.engine,
    sessionId: threadContext.sessionId,
    conversationLabel: threadContext.conversationLabel,
    removedUserMessageCount: impactedItems.filter(
      (item) => item.kind === "message" && item.role === "user",
    ).length,
    removedAssistantMessageCount: impactedItems.filter(
      (item) => item.kind === "message" && item.role === "assistant",
    ).length,
    removedToolCallCount: impactedItems.filter((item) => item.kind === "tool")
      .length,
    affectedFiles,
  };
}

export function normalizeInlineFileReferenceTokens(text: string) {
  return text.replace(
    INLINE_FILE_REFERENCE_TOKEN_REGEX,
    (_full, _icon: string, _name: string, fullPath: string) => fullPath,
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractInlineFileReferenceTokens(
  text: string,
  existingReferenceIds: Set<string> = new Set(),
) {
  const extracted: InlineFileReferenceSelection[] = [];
  const seenInBatch = new Set<string>();
  const cleanedText = text.replace(
    INLINE_FILE_REFERENCE_TOKEN_REGEX,
    (
      _full,
      iconRaw: string,
      nameRaw: string,
      fullPathRaw: string,
      offset: number,
      source: string,
    ) => {
      const icon = iconRaw === "📁" ? "📁" : "📄";
      const name = nameRaw.trim();
      const fullPath = fullPathRaw.trim();
      const id = `${icon}:${fullPath}`;
      const label = `${icon} ${name}`;
      const prefixText = source.slice(0, offset);
      const hasVisibleLabelBefore = new RegExp(
        `(?:^|\\s)${escapeRegExp(label)}(?:\\s|$)`,
      ).test(prefixText);
      const seenBefore = seenInBatch.has(id);
      if (seenBefore) {
        return "";
      }
      seenInBatch.add(id);
      const isExistingReference = existingReferenceIds.has(id);
      if (isExistingReference) {
        // Keep one visible label for already-tracked refs; only trim duplicates.
        return hasVisibleLabelBefore ? "" : label;
      }
      if (hasVisibleLabelBefore) {
        return "";
      }
      extracted.push({
        id,
        icon,
        label,
        path: fullPath,
      });
      return label;
    },
  );
  return {
    cleanedText: cleanedText.replace(/ {3,}/g, "  ").replace(/[ \t]+\n/g, "\n"),
    extracted,
  };
}

export function replaceVisibleFileReferenceLabels(
  text: string,
  refs: InlineFileReferenceSelection[],
) {
  let nextText = text;
  for (const ref of refs) {
    const pattern = new RegExp(escapeRegExp(ref.label), "g");
    if (!pattern.test(nextText)) {
      continue;
    }
    nextText = nextText.replace(pattern, ref.path);
  }
  return nextText;
}
