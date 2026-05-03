import { describe, expect, it } from "vitest";
import { formatContextLedgerInspectionMarkdown } from "./contextLedgerInspectionMarkdown";

describe("formatContextLedgerInspectionMarkdown", () => {
  it("reconstructs labeled dense markdown sections into readable markdown", () => {
    const formatted = formatContextLedgerInspectionMarkdown(
      [
        "用户输入：做一次项目分析吧",
        "",
        "助手输出：##📊 项目概览|维度|内容||技术栈|Spring Boot|Java 11|##✅ 做得好的地方|1. 分层清晰|2. 统一响应",
      ].join("\n"),
    );

    expect(formatted).toContain("### 用户输入");
    expect(formatted).toContain("做一次项目分析吧");
    expect(formatted).toContain("### 助手输出");
    expect(formatted).toContain("## 📊 项目概览");
    expect(formatted).toContain("维度\n内容\n技术栈");
    expect(formatted).toContain("## ✅ 做得好的地方");
  });

  it("keeps plain markdown content readable without labeled sections", () => {
    const formatted = formatContextLedgerInspectionMarkdown(
      "## Summary\n\n- item 1\n- item 2",
    );

    expect(formatted).toBe("## Summary\n\n- item 1\n- item 2");
  });

  it("does not split marker-like prose that appears mid-paragraph", () => {
    const source =
      "排查记录：如果日志里出现 User input: foo，请不要把它当成新的结构化小节。";

    expect(formatContextLedgerInspectionMarkdown(source)).toBe(source);
  });
});
