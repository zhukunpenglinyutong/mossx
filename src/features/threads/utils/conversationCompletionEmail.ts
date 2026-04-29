import type {
  ConversationItem,
  EngineType,
  SendConversationCompletionEmailRequest,
} from "../../../types";

const MAX_TEXT_SECTION_LENGTH = 12_000;
const MAX_FILE_CHANGE_ITEMS = 20;

type MessageItem = Extract<ConversationItem, { kind: "message" }>;
type ToolItem = Extract<ConversationItem, { kind: "tool" }>;

export type ConversationCompletionEmailMetadata = {
  workspaceId: string;
  workspaceName?: string | null;
  workspacePath?: string | null;
  threadId: string;
  threadName?: string | null;
  turnId: string;
  engine?: EngineType | null;
};

export type ConversationCompletionEmailBuildResult =
  | {
      status: "ready";
      request: SendConversationCompletionEmailRequest;
      userMessage: string;
      assistantMessage: string;
      activityCount: number;
    }
  | {
      status: "skipped";
      reason: "missing_user_message" | "missing_assistant_message" | "missing_metadata";
    };

function isMessageItem(item: ConversationItem): item is MessageItem {
  return item.kind === "message";
}

function nonEmptyText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 32)).trimEnd()}\n...[truncated ${value.length - maxLength} chars]`;
}

function compactLine(value: string | null | undefined): string {
  return nonEmptyText(value).replace(/\s+/g, " ");
}

function formatMetadata(metadata: ConversationCompletionEmailMetadata): string[] {
  const lines = [
    `Workspace: ${metadata.workspaceName?.trim() || metadata.workspaceId}`,
    `Thread: ${metadata.threadName?.trim() || metadata.threadId}`,
    `Turn: ${metadata.turnId}`,
  ];
  if (metadata.workspacePath?.trim()) {
    lines.push(`Path: ${metadata.workspacePath.trim()}`);
  }
  if (metadata.engine) {
    lines.push(`Engine: ${metadata.engine}`);
  }
  return lines;
}

function formatFileChangeActivity(item: ToolItem): string | null {
  if (item.toolType !== "fileChange") {
    return null;
  }

  const title = compactLine(item.title) || "File changes";
  const lines = [`- ${title}`];
  const changedPaths = (item.changes ?? [])
    .map((change) => compactLine(change.path))
    .filter(Boolean);
  if (changedPaths.length > 0) {
    changedPaths.forEach((path) => {
      lines.push(`  - ${path}`);
    });
  }
  return lines.join("\n");
}

function findFinalAssistantIndex(items: ConversationItem[]): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (
      item &&
      isMessageItem(item) &&
      item.role === "assistant" &&
      nonEmptyText(item.text)
    ) {
      return index;
    }
  }
  return -1;
}

function findUserIndexBefore(items: ConversationItem[], beforeIndex: number): number {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (
      item &&
      isMessageItem(item) &&
      item.role === "user" &&
      (nonEmptyText(item.text) || (item.images?.length ?? 0) > 0)
    ) {
      return index;
    }
  }
  return -1;
}

export function buildConversationCompletionEmail(
  items: ConversationItem[],
  metadata: ConversationCompletionEmailMetadata,
): ConversationCompletionEmailBuildResult {
  if (
    !metadata.workspaceId.trim() ||
    !metadata.threadId.trim() ||
    !metadata.turnId.trim()
  ) {
    return { status: "skipped", reason: "missing_metadata" };
  }

  const assistantIndex = findFinalAssistantIndex(items);
  if (assistantIndex < 0) {
    return { status: "skipped", reason: "missing_assistant_message" };
  }

  const userIndex = findUserIndexBefore(items, assistantIndex);
  if (userIndex < 0) {
    return { status: "skipped", reason: "missing_user_message" };
  }

  const userItem = items[userIndex] as MessageItem;
  const assistantItem = items[assistantIndex] as MessageItem;
  const userMessage = nonEmptyText(userItem.text) || "[Image-only message]";
  const assistantMessage = nonEmptyText(assistantItem.text);
  if (!assistantMessage) {
    return { status: "skipped", reason: "missing_assistant_message" };
  }

  const fileChangeSummaries = items
    .slice(userIndex + 1)
    .filter((item): item is ToolItem => item.kind === "tool")
    .map(formatFileChangeActivity)
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, MAX_FILE_CHANGE_ITEMS);
  const subjectWorkspace = metadata.workspaceName?.trim() || metadata.workspaceId;
  const subject = `Moss conversation completed - ${subjectWorkspace}`;
  const sections = [
    "Moss conversation completed",
    "",
    ...formatMetadata(metadata),
    "",
    "User",
    truncateText(userMessage, MAX_TEXT_SECTION_LENGTH),
    "",
    "Assistant",
    truncateText(assistantMessage, MAX_TEXT_SECTION_LENGTH),
  ];

  if (fileChangeSummaries.length > 0) {
    sections.push("", "File changes", ...fileChangeSummaries);
  }

  return {
    status: "ready",
    request: {
      workspaceId: metadata.workspaceId,
      threadId: metadata.threadId,
      turnId: metadata.turnId,
      subject,
      textBody: sections.join("\n"),
    },
    userMessage,
    assistantMessage,
    activityCount: fileChangeSummaries.length,
  };
}
