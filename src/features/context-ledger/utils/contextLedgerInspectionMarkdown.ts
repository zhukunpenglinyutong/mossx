import { normalizeDenseMarkdownOutput } from "../../../utils/denseMarkdownOutput";

const DETAIL_SECTION_MARKER_REGEX =
  /(?:^|\n)\s*(用户输入|助手输出摘要|助手输出|User input|Assistant summary|Assistant output)[:：]/gi;

type InspectionMarkdownSection = {
  label: string;
  content: string;
};

function normalizeInspectionSectionLabel(raw: string) {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "user input") {
    return "User input";
  }
  if (normalized === "assistant summary") {
    return "Assistant summary";
  }
  if (normalized === "assistant output") {
    return "Assistant output";
  }
  return raw.trim();
}

function parseInspectionMarkdownSections(detail: string): InspectionMarkdownSection[] {
  const text = detail.trim();
  if (!text) {
    return [];
  }
  const matches = Array.from(
    text.matchAll(
      new RegExp(DETAIL_SECTION_MARKER_REGEX.source, DETAIL_SECTION_MARKER_REGEX.flags),
    ),
  );
  if (matches.length === 0) {
    return [];
  }
  const sections: InspectionMarkdownSection[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    if (!current || current.index === undefined) {
      continue;
    }
    const rawLabel = current[1] ?? "";
    const start = current.index + current[0].length;
    const next = matches[index + 1];
    const end = next?.index ?? text.length;
    const content = text.slice(start, end).trim();
    if (!content) {
      continue;
    }
    sections.push({
      label: normalizeInspectionSectionLabel(rawLabel),
      content,
    });
  }
  return sections;
}

export function formatContextLedgerInspectionMarkdown(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return "";
  }

  const sections = parseInspectionMarkdownSections(trimmed);
  if (sections.length === 0) {
    return normalizeDenseMarkdownOutput(trimmed);
  }

  return sections
    .map((section) => {
      const normalizedContent = normalizeDenseMarkdownOutput(section.content);
      return `### ${section.label}\n\n${normalizedContent}`;
    })
    .join("\n\n");
}
