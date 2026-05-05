export type AgentTaskNotification = {
  taskId: string | null;
  toolUseId: string | null;
  outputFile: string | null;
  status: string | null;
  summary: string | null;
  resultText: string;
};

const TASK_NOTIFICATION_OPEN_TAG = /<\s*task-notification\s*>/i;
const RESULT_OPEN_TAG_REGEX = /<\s*result\s*>/i;
const RESULT_CLOSE_SUFFIX_REGEX =
  /\s*<\s*\/\s*result\s*>\s*(?:<\s*\/\s*task-notification\s*>\s*)?$/i;

function decodeNotificationEntities(text: string): string {
  let decoded = text;
  for (let index = 0; index < 3; index += 1) {
    const next = decoded
      .replace(/&lt;|&#60;|&#x3c;/gi, "<")
      .replace(/&gt;|&#62;|&#x3e;/gi, ">")
      .replace(/&amp;|&#38;|&#x26;/gi, "&");
    if (next === decoded) {
      break;
    }
    decoded = next;
  }
  return decoded;
}

function extractTagValue(block: string, tagName: string): string | null {
  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `<\\s*${escapedTagName}\\s*>\\s*([\\s\\S]*?)\\s*<\\s*\\/\\s*${escapedTagName}\\s*>`,
    "i",
  ).exec(block);
  const value = match?.[1]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

function normalizeResultText(text: string): string {
  return text.replace(RESULT_CLOSE_SUFFIX_REGEX, "").trim();
}

export function parseAgentTaskNotification(
  text: string,
): AgentTaskNotification | null {
  const trimmedRawText = text.trimStart();
  const firstChar = trimmedRawText.charAt(0);
  if (!firstChar || (firstChar !== "<" && firstChar !== "&")) {
    return null;
  }
  const trimmedText = firstChar === "<"
    ? trimmedRawText
    : decodeNotificationEntities(trimmedRawText).trimStart();
  const taskNotificationMatch = TASK_NOTIFICATION_OPEN_TAG.exec(trimmedText);
  if (!taskNotificationMatch || typeof taskNotificationMatch.index !== "number") {
    return null;
  }
  if (taskNotificationMatch.index !== 0) {
    return null;
  }
  const normalizedText = trimmedText.slice(taskNotificationMatch.index);
  const resultOpenMatch = RESULT_OPEN_TAG_REGEX.exec(normalizedText);
  if (!resultOpenMatch || typeof resultOpenMatch.index !== "number") {
    return null;
  }
  const headerBlock = normalizedText.slice(0, resultOpenMatch.index);
  const resultText = normalizeResultText(
    normalizedText.slice(resultOpenMatch.index + resultOpenMatch[0].length),
  );
  const taskId = extractTagValue(headerBlock, "task-id");
  const toolUseId = extractTagValue(headerBlock, "tool-use-id");
  const outputFile = extractTagValue(headerBlock, "output-file");
  const status = extractTagValue(headerBlock, "status");
  const summary = extractTagValue(headerBlock, "summary");
  return {
    taskId,
    toolUseId,
    outputFile,
    status,
    summary,
    resultText,
  };
}
