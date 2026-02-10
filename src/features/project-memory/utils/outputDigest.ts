/**
 * Assistant 输出压缩器 —— 将 assistant 回复文本提炼为结构化摘要。
 *
 * 职责：
 *  1. 清洗 markdown 噪声（代码块、多空行、装饰符号）
 *  2. 提取核心句生成 summary
 *  3. 截断超长内容生成 detail
 *  4. 基于第一句/关键词生成 title
 *  5. 对无效文本（空、纯噪声）返回 null
 */

/** 摘要输出结构 */
export type OutputDigest = {
  title: string;
  summary: string;
  detail: string;
};

/** 清洗后文本最小有效长度（字符数）——中文短回复通常 4-5 字即有语义 */
const MIN_CLEAN_LENGTH = 4;
/** summary 最大字符数 */
const SUMMARY_MAX_LENGTH = 200;
/** detail 最大字符数 */
const DETAIL_MAX_LENGTH = 800;
/** title 最大字符数 */
const TITLE_MAX_LENGTH = 50;
/** summary 提取的最大句数 */
const SUMMARY_MAX_SENTENCES = 3;

/**
 * 清洗 markdown 噪声，返回纯文本。
 * - 移除 fenced code blocks（```...```）
 * - 移除 inline code（`...`）
 * - 移除 markdown 装饰（#, *, -, >, |）
 * - 压缩多余空白行
 */
function cleanMarkdown(text: string): string {
  return (
    text
      // 移除 fenced code blocks（含语言标记）
      .replace(/```[\s\S]*?```/g, "")
      // 移除 inline code
      .replace(/`[^`]+`/g, "")
      // 移除 heading 标记
      .replace(/^#{1,6}\s+/gm, "")
      // 移除加粗/斜体标记
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
      // 移除列表标记
      .replace(/^[\s]*[-*+]\s+/gm, "")
      .replace(/^[\s]*\d+\.\s+/gm, "")
      // 移除引用标记
      .replace(/^>\s*/gm, "")
      // 移除表格分隔线
      .replace(/^\|[-:| ]+\|$/gm, "")
      // 移除表格管道符
      .replace(/\|/g, " ")
      // 移除链接 [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // 移除图片标记
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
      // 压缩多余空白行
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * 按句号/问号/感叹号/换行拆分句子，过滤空句。
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？.!?\n])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 截断字符串到指定长度，末尾补省略号。
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 1) + "\u2026";
}

/**
 * 从清洗文本中提取 title：取第一句的前 N 个字符。
 */
function extractTitle(sentences: string[]): string {
  const firstSentence = sentences[0] ?? "";
  return truncate(firstSentence, TITLE_MAX_LENGTH);
}

/**
 * 从清洗文本中提取 summary：取前若干核心句。
 */
function extractSummary(sentences: string[]): string {
  const core = sentences.slice(0, SUMMARY_MAX_SENTENCES).join(" ");
  return truncate(core, SUMMARY_MAX_LENGTH);
}

/**
 * 生成 detail：截断到上限。
 */
function extractDetail(cleanText: string): string {
  return truncate(cleanText, DETAIL_MAX_LENGTH);
}

/**
 * 将 assistant 回复压缩为结构化摘要。
 * 无效文本（空、纯噪声、过短）返回 null。
 */
export function buildAssistantOutputDigest(
  text: string,
): OutputDigest | null {
  if (!text || !text.trim()) {
    return null;
  }

  const cleanText = cleanMarkdown(text);

  if (cleanText.length < MIN_CLEAN_LENGTH) {
    return null;
  }

  const sentences = splitSentences(cleanText);
  if (sentences.length === 0) {
    return null;
  }

  const title = extractTitle(sentences);
  const summary = extractSummary(sentences);
  const detail = extractDetail(cleanText);

  // 最终校验：title 和 summary 都不能为空
  if (!title || !summary) {
    return null;
  }

  return { title, summary, detail };
}
