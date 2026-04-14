import type { ConversationItem } from "../../../types";

export interface LatestUserMessagePreview {
  text: string;
  imageCount: number;
  hasMessage: boolean;
}

/**
 * 提取当前线程最后一条可展示的用户消息。
 *
 * 首期仅对文本与 images 做稳定支持：
 * - text: 使用 trim 后的文本
 * - imageCount: 使用 ConversationItem.images 的数量
 */
export function resolveLatestUserMessagePreview(
  items: ConversationItem[] | undefined,
): LatestUserMessagePreview {
  if (!Array.isArray(items) || items.length === 0) {
    return { text: "", imageCount: 0, hasMessage: false };
  }

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const candidate = items[index];
    if (candidate?.kind !== "message" || candidate.role !== "user") {
      continue;
    }

    const text = candidate.text.trim();
    const imageCount = Array.isArray(candidate.images) ? candidate.images.length : 0;
    if (!text && imageCount === 0) {
      continue;
    }

    return {
      text,
      imageCount,
      hasMessage: true,
    };
  }

  return { text: "", imageCount: 0, hasMessage: false };
}
