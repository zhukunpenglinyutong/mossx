export type ManualMemoryPreviewInput = {
  index?: string | null;
  label?: string | null;
  title?: string | null;
  summary?: string | null;
  detail?: string | null;
  description?: string | null;
};

export type ManualMemoryPreview = {
  title: string;
  summary: string;
};

const MEMORY_USER_INPUT_REGEX =
  /(?:^|\n)\s*(?:用户输入|User input)[:：]\s*([\s\S]*?)(?=\n+\s*(?:助手输出摘要|助手输出|Assistant summary|Assistant output)[:：]|$)/i;
const MEMORY_ASSISTANT_SUMMARY_REGEX =
  /(?:^|\n)\s*(?:助手输出摘要|Assistant summary)[:：]\s*([\s\S]*?)(?=\n+\s*(?:助手输出|Assistant output)[:：]|$)/i;

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.map((value) => compactWhitespace(value ?? "")).find(Boolean) ?? "";
}

function extractSection(regex: RegExp, text: string) {
  const matched = text.match(regex);
  return compactWhitespace(matched?.[1] ?? "");
}

export function resolveManualMemoryPreview(
  input: ManualMemoryPreviewInput,
): ManualMemoryPreview {
  const detail = input.detail?.trim() ?? "";
  const userInput = extractSection(MEMORY_USER_INPUT_REGEX, detail);
  const assistantSummary = extractSection(MEMORY_ASSISTANT_SUMMARY_REGEX, detail);
  const title = firstNonEmpty(userInput, input.title, input.label);
  const summary = firstNonEmpty(
    assistantSummary,
    input.summary,
    input.description,
    detail,
    input.label,
  );
  return {
    title: input.index ? `${input.index} ${title || "Untitled memory"}` : title || "Untitled memory",
    summary: summary || "No summary available.",
  };
}
