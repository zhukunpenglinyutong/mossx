import { describe, it, expect } from "vitest";
import { buildAssistantOutputDigest } from "./outputDigest";

describe("buildAssistantOutputDigest", () => {
  it("returns null for empty string", () => {
    expect(buildAssistantOutputDigest("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(buildAssistantOutputDigest("   \n\n  ")).toBeNull();
  });

  it("returns null for pure noise (only code blocks)", () => {
    const noise = "```js\nconsole.log('hello');\n```";
    expect(buildAssistantOutputDigest(noise)).toBeNull();
  });

  it("returns null for text shorter than minimum after cleaning", () => {
    // 2 chars < MIN_CLEAN_LENGTH(4)
    expect(buildAssistantOutputDigest("ok")).toBeNull();
  });

  it("returns null for 3-char text (just below threshold)", () => {
    expect(buildAssistantOutputDigest("好的吧")).toBeNull();
  });

  it("returns digest for 4-char Chinese text (at threshold)", () => {
    const result = buildAssistantOutputDigest("你是湘宁");
    expect(result).not.toBeNull();
    expect(result!.title).toBe("你是湘宁");
    expect(result!.summary).toBe("你是湘宁");
  });

  it("returns digest for a normal assistant reply", () => {
    const text =
      "This function calculates the sum of an array. " +
      "It iterates through each element and accumulates the total. " +
      "The time complexity is O(n).";

    const result = buildAssistantOutputDigest(text);

    expect(result).not.toBeNull();
    expect(result!.title).toBeTruthy();
    expect(result!.summary).toBeTruthy();
    expect(result!.detail).toBeTruthy();
    expect(result!.title.length).toBeLessThanOrEqual(50);
    expect(result!.summary.length).toBeLessThanOrEqual(200);
    expect(result!.detail.length).toBeLessThanOrEqual(800);
  });

  it("handles mixed code blocks and text", () => {
    const text = [
      "Here is the implementation:",
      "",
      "```typescript",
      "function add(a: number, b: number): number {",
      "  return a + b;",
      "}",
      "```",
      "",
      "The function takes two numbers and returns their sum. It is a pure function with no side effects.",
    ].join("\n");

    const result = buildAssistantOutputDigest(text);

    expect(result).not.toBeNull();
    // Code block content should be stripped
    expect(result!.detail).not.toContain("function add");
    expect(result!.summary).toContain("pure function");
  });

  it("truncates long detail to max length", () => {
    const longText = "This is a meaningful sentence. ".repeat(100);

    const result = buildAssistantOutputDigest(longText);

    expect(result).not.toBeNull();
    expect(result!.detail.length).toBeLessThanOrEqual(800);
    expect(result!.detail.endsWith("\u2026")).toBe(true);
  });

  it("truncates long summary to max length", () => {
    // Create text with very long sentences to exceed summary limit
    const longSentence = "A".repeat(100) + ". ";
    const text = longSentence.repeat(5);

    const result = buildAssistantOutputDigest(text);

    expect(result).not.toBeNull();
    expect(result!.summary.length).toBeLessThanOrEqual(200);
  });

  it("strips markdown formatting from text", () => {
    const text = [
      "## Summary",
      "",
      "**Bold text** with *italic* and `inline code`.",
      "",
      "- List item one",
      "- List item two",
      "",
      "> A blockquote with important info about the design.",
    ].join("\n");

    const result = buildAssistantOutputDigest(text);

    expect(result).not.toBeNull();
    // Markdown symbols should be cleaned
    expect(result!.detail).not.toContain("##");
    expect(result!.detail).not.toContain("**");
    expect(result!.detail).not.toContain("`");
    expect(result!.detail).not.toContain("- ");
    expect(result!.detail).not.toContain("> ");
  });

  it("handles Chinese text correctly", () => {
    const text =
      "这个函数计算数组的总和。它遍历每个元素并累加结果。时间复杂度为 O(n)，空间复杂度为 O(1)。";

    const result = buildAssistantOutputDigest(text);

    expect(result).not.toBeNull();
    expect(result!.title).toBeTruthy();
    expect(result!.summary).toContain("计算数组的总和");
  });
});
