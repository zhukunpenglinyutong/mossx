import { describe, expect, it } from "vitest";
import { resolveManualMemoryPreview } from "./manualMemoryPreview";

describe("resolveManualMemoryPreview", () => {
  it("uses user input as title and assistant summary as compact summary", () => {
    expect(
      resolveManualMemoryPreview({
        label: "Fallback",
        summary: "Fallback summary",
        detail: [
          "用户输入：skills/wf-thinking 分析一下",
          "助手输出摘要：先读规范，再给出方案。",
          "助手输出：完整回答不应该进入左侧候选。",
        ].join("\n"),
      }),
    ).toEqual({
      title: "skills/wf-thinking 分析一下",
      summary: "先读规范，再给出方案。",
    });
  });

  it("supports English section labels", () => {
    expect(
      resolveManualMemoryPreview({
        label: "Fallback",
        detail: [
          "User input: Explain the release plan",
          "Assistant summary: Build first, then smoke test.",
          "Assistant output: Full answer.",
        ].join("\n"),
      }),
    ).toEqual({
      title: "Explain the release plan",
      summary: "Build first, then smoke test.",
    });
  });

  it("prefixes stable memory index when provided", () => {
    expect(
      resolveManualMemoryPreview({
        index: "[M2]",
        title: "项目技术栈",
        summary: "Spring Boot",
      }).title,
    ).toBe("[M2] 项目技术栈");
  });
});
