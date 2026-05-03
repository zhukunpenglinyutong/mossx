const MANUAL_MEMORY_USER_INPUT_REGEX =
  /(?:^|\n)\s*用户输入[:：]\s*([\s\S]*?)(?=\n+\s*(?:助手输出摘要|助手输出)[:：]|$)/;
const MANUAL_MEMORY_ASSISTANT_SUMMARY_REGEX =
  /(?:^|\n)\s*助手输出摘要[:：]\s*([\s\S]*?)(?=\n+\s*(?:助手输出|用户输入)[:：]|$)/;

type ManualMemoryChipSelection = {
  title: string;
  summary: string;
  detail: string;
};

type NoteCardChipSelection = {
  title: string;
  plainTextExcerpt: string;
  bodyMarkdown: string;
};

export function resolveManualMemoryChipTitle(memory: ManualMemoryChipSelection) {
  const detail = memory.detail.trim();
  if (detail) {
    const matched = detail.match(MANUAL_MEMORY_USER_INPUT_REGEX);
    if (matched?.[1]) {
      const normalized = matched[1].replace(/\s+/g, " ").trim();
      if (normalized) {
        return normalized;
      }
    }
    const firstLine = detail
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (firstLine) {
      return firstLine;
    }
  }
  const fallbackSummary = memory.summary.trim();
  if (fallbackSummary) {
    return fallbackSummary;
  }
  return "（未提取到用户输入）";
}

export function resolveManualMemoryChipDetail(memory: ManualMemoryChipSelection) {
  const detail = memory.detail.trim();
  if (detail) {
    const matched = detail.match(MANUAL_MEMORY_ASSISTANT_SUMMARY_REGEX);
    if (matched?.[1]) {
      const normalized = matched[1].replace(/\s+/g, " ").trim();
      if (normalized) {
        return normalized;
      }
    }
  }
  const fallbackSummary = memory.summary.trim();
  if (fallbackSummary) {
    return fallbackSummary;
  }
  return "";
}

export function resolveNoteCardChipTitle(noteCard: NoteCardChipSelection) {
  const normalizedBody = noteCard.bodyMarkdown.trim();
  if (normalizedBody) {
    const firstLine = normalizedBody
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (firstLine) {
      return firstLine.replace(/^#{1,6}\s*/, "");
    }
  }
  const fallbackExcerpt = noteCard.plainTextExcerpt.trim();
  if (fallbackExcerpt) {
    return fallbackExcerpt;
  }
  return noteCard.title.trim() || "未命名便签";
}

export function resolveNoteCardChipDetail(noteCard: NoteCardChipSelection) {
  const normalizedTitle = noteCard.title.trim();
  const normalizedChipTitle = resolveNoteCardChipTitle(noteCard);
  if (normalizedTitle && normalizedTitle !== normalizedChipTitle) {
    return normalizedTitle;
  }
  const normalizedExcerpt = noteCard.plainTextExcerpt.trim();
  if (normalizedExcerpt && normalizedExcerpt !== normalizedChipTitle) {
    return normalizedExcerpt;
  }
  return "";
}
