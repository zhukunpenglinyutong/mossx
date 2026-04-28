import type { ConversationItem } from "../../../types";

const EXPLICIT_IMAGEGEN_COMMAND_REGEX =
  /^\s*(?:`{1,3})?\/?imagegen(?:`{1,3})?(?:\s+|[:：,，-]+)([\s\S]+?)\s*$/i;

const DIRECT_IMAGE_REQUEST_REGEXES = [
  /^\s*(?:请|麻烦|帮我|给我|直接|现在)?\s*(?:生成|画|绘制|做|出)\s*(?:一|1)?\s*(?:张|幅)?[\s\S]{0,120}?(?:图|图片|配图|插画|海报|概念图|示意图|风景图|美女图|头像|封面图)/u,
  /^\s*(?:please\s+)?(?:generate|draw|paint|create|make)\s+(?:me\s+)?(?:an?\s+)?[\s\S]{0,120}?(?:image|picture|illustration|poster|concept\s+art|concept\s+image)\b/i,
] as const;

const DIRECT_IMAGE_REQUEST_BLOCKLIST = [
  "placeholder",
  "reducer",
  "hook",
  "误触发",
  "幕布",
  "渲染",
  "render",
  "卡片",
  "processing",
  "loading",
  "skill",
  "assistant",
  "如果有用户",
  "用户让你",
  "当用户",
  "怎么处理",
  "提案",
  "实现逻辑",
  "代码里",
] as const;

export function isProcessingGeneratedImageItem(
  item: ConversationItem | undefined,
): item is Extract<ConversationItem, { kind: "generatedImage" }> {
  return item?.kind === "generatedImage" && item.status === "processing";
}

export function extractExplicitImagegenCommandPrompt(value: string) {
  const match = EXPLICIT_IMAGEGEN_COMMAND_REGEX.exec(value);
  const promptText = match?.[1]?.trim() ?? "";
  return promptText || null;
}

function isDirectImageRequest(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  const normalized = trimmed.toLowerCase();
  if (
    DIRECT_IMAGE_REQUEST_BLOCKLIST.some((keyword) =>
      normalized.includes(keyword.toLowerCase()),
    )
  ) {
    return false;
  }
  return DIRECT_IMAGE_REQUEST_REGEXES.some((pattern) => pattern.test(trimmed));
}

export function extractOptimisticGeneratedImagePrompt(value: string) {
  const explicitCommandPrompt = extractExplicitImagegenCommandPrompt(value);
  if (explicitCommandPrompt) {
    return explicitCommandPrompt;
  }
  return isDirectImageRequest(value) ? value.trim() : null;
}

export function createOptimisticGeneratedImageProcessingItem({
  threadId,
  userMessageId,
  promptText,
}: {
  threadId: string;
  userMessageId: string;
  promptText: string;
}): Extract<ConversationItem, { kind: "generatedImage" }> {
  return {
    id: `optimistic-generated-image:${threadId}:${userMessageId}`,
    kind: "generatedImage",
    status: "processing",
    sourceToolName: "image_generation_call",
    promptText,
    anchorUserMessageId: userMessageId,
    images: [],
  };
}

export function normalizeGeneratedImagePrompt(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

export function scoreGeneratedImageMatch(
  placeholder: Extract<ConversationItem, { kind: "generatedImage" }>,
  incoming: Extract<ConversationItem, { kind: "generatedImage" }>,
) {
  let score = 0;
  const placeholderPrompt = normalizeGeneratedImagePrompt(placeholder.promptText);
  const incomingPrompt = normalizeGeneratedImagePrompt(incoming.promptText);
  if (placeholderPrompt && incomingPrompt) {
    if (
      placeholderPrompt === incomingPrompt ||
      placeholderPrompt.includes(incomingPrompt) ||
      incomingPrompt.includes(placeholderPrompt)
    ) {
      score += 3;
    }
  }
  if (
    placeholder.anchorUserMessageId &&
    incoming.anchorUserMessageId &&
    placeholder.anchorUserMessageId === incoming.anchorUserMessageId
  ) {
    score += 2;
  }
  return score;
}
