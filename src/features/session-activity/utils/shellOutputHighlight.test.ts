import { describe, expect, it } from "vitest";
import {
  inferCommandOutputRenderMeta,
  normalizeCommandMarkdownOutput,
  renderCodeOutputHtml,
  renderShellOutputHtml,
} from "./shellOutputHighlight";

describe("renderShellOutputHtml", () => {
  it("highlights command and flags", () => {
    const html = renderShellOutputHtml("ls -la ./src");
    expect(html).toContain('session-activity-shell-token-command">ls<');
    expect(html).toContain('session-activity-shell-token-flag">-la<');
    expect(html).toContain('session-activity-shell-token-path">./src<');
  });

  it("highlights ls-like metadata tokens", () => {
    const html = renderShellOutputHtml("drwxr-xr-x 6 user staff 192 Mar 11 16:40 assets");
    expect(html).toContain('session-activity-shell-token-permission">drwxr-xr-x<');
    expect(html).toContain('session-activity-shell-token-number">192<');
    expect(html).toContain('session-activity-shell-token-time">Mar<');
    expect(html).toContain('session-activity-shell-token-time">16:40<');
  });

  it("marks error line and escapes html", () => {
    const html = renderShellOutputHtml("fatal error: <broken>");
    expect(html).toContain("session-activity-command-line-error");
    expect(html).toContain("&lt;broken&gt;");
  });

  it("detects markdown render mode for markdown file reads", () => {
    const meta = inferCommandOutputRenderMeta("cat README.md", "# Title\n\n- item");
    expect(meta.mode).toBe("markdown");
  });

  it("detects code render mode for source file reads", () => {
    const meta = inferCommandOutputRenderMeta(
      'sed -n "1,260p" src/main/java/com/example/demo/UserService.java',
      "public class UserService {}",
    );
    expect(meta.mode).toBe("code");
    expect(meta.language).toBe("java");
  });

  it("renders code output with highlighted token markup", () => {
    const html = renderCodeOutputHtml("public class UserService {}", "java");
    expect(html).toContain('class="token');
  });

  it("detects markdown render mode for wrapped shell read command", () => {
    const meta = inferCommandOutputRenderMeta(
      `/bin/zsh -lc "zsh -lc 'source ~/.zshrc && sed -n \\"1,260p\\" README.md'"`,
      "### Title\n\n- item",
    );
    expect(meta.mode).toBe("markdown");
  });

  it("detects markdown render mode for dense single-line markdown output", () => {
    const meta = inferCommandOutputRenderMeta(
      "echo report",
      "--# 📊 项目分析报告 ## 项目概述 | 项目属性 | 值 | |------|------|------|",
    );
    expect(meta.mode).toBe("markdown");
  });

  it("detects markdown render mode for screenshot-like flattened report output", () => {
    const output =
      "---#📊 项目分析报告## 项目概述|项目属性|值| |------|------|------|项目名称|Dify mem0插件本地化改造|工作区路径|/Users/chenxiangning/.codemoss/workspace|核心内容|memo0 Dify插件源码修改与打包|";
    const meta = inferCommandOutputRenderMeta("Command", output);
    expect(meta.mode).toBe("markdown");
  });

  it("normalizes flattened markdown headings into multiline markdown blocks", () => {
    const output =
      "---#📊 项目分析报告## 项目概述|项目属性|值||------|------|------|项目名称|Dify mem0插件本地化改造|工作区路径|/Users/chenxiangning/.codemoss/workspace|";
    const normalized = normalizeCommandMarkdownOutput(output);
    expect(normalized).toContain("# 📊 项目分析报告");
    expect(normalized).toContain("## 项目概述");
    expect(normalized).toContain("| 项目属性 | 值 |");
    expect(normalized).toContain("| 项目名称 | Dify mem0插件本地化改造 |");
  });

  it("drops command label noise lines from flattened markdown output", () => {
    const output = "命令|Command||---#📊 项目分析报告## 项目概述|项目属性|值||------|------|------|项目名称|Dify|";
    const normalized = normalizeCommandMarkdownOutput(output);
    expect(normalized).not.toContain("命令|Command");
    expect(normalized).toContain("# 📊 项目分析报告");
  });

  it("drops command label noise lines when separated by spaces", () => {
    const output = "命令 Command||---#📊 项目分析报告## 项目概述|项目属性|值||------|------|------|项目名称|Dify|";
    const normalized = normalizeCommandMarkdownOutput(output);
    expect(normalized).not.toContain("命令 Command");
    expect(normalized).toContain("# 📊 项目分析报告");
  });

  it("restores escaped fenced code blocks in flattened markdown output", () => {
    const output =
      "###代码变更详情|1. provider/mem0.py|\\`\\`\\`python|print('ok')|\\`\\`\\`|2. tools/add_memory.py|";
    const normalized = normalizeCommandMarkdownOutput(output);
    expect(normalized).toContain("```python");
    expect(normalized).toContain("```");
    expect(normalized).toContain("print('ok')");
  });

  it("removes stray backticks while preserving fenced code blocks", () => {
    const output =
      "目录结构``workspace/|---# 代码段|\\`\\`\\`python|print('ok')|\\`\\`\\`|模板目录(空)``|";
    const normalized = normalizeCommandMarkdownOutput(output);
    expect(normalized).not.toContain("``workspace");
    expect(normalized).not.toContain("(空)``");
    expect(normalized).toContain("```python");
    expect(normalized).toContain("print('ok')");
  });

  it("cleans duplicated pipe separators in non-table lines", () => {
    const output =
      "##目录结构|项目属性|值||---|---|---|项目名称|Dify|核心源码管理目录|| |—— original/|原始0.0.2版本解包源码|| |—— modified/|";
    const normalized = normalizeCommandMarkdownOutput(output);
    expect(normalized).toContain("| 项目属性 | 值 |");
    expect(normalized).not.toContain("|| |——");
    expect(normalized).toContain("核心源码管理目录");
    expect(normalized).toContain("```\n—— original/\n原始0.0.2版本解包源码\n—— modified/\n```");
    expect(normalized).toContain("—— modified/");
  });

  it("reconstructs screenshot-like dense markdown into tables and fenced code blocks", () => {
    const output =
      "# 📊 项目分析报告|项目概览|项目属性|值||---|---|项目名称|Dify mem0插件本地化改造|工作区路径|/Users/test/workspace|核心改造内容|改造目标|将 mem0官方 Dify插件从云端 API改造为本地部署支持。|关键改动|改动项|原始版本|修改后版本||---|---|---|API端点|硬编码 https://api.mem0.ai|可配置 mem0_base_url|代码变更详情|1. provider/mem0.py (凭据校验)|```python|print('ok')|```|";
    const normalized = normalizeCommandMarkdownOutput(output);
    expect(normalized).toContain("| 项目属性 | 值 |");
    expect(normalized).toContain("| 项目名称 | Dify mem0插件本地化改造 |");
    expect(normalized).toContain("| 改动项 | 原始版本 | 修改后版本 |");
    expect(normalized).toContain("1. provider/mem0.py (凭据校验)");
    expect(normalized).toContain("```python\nprint('ok')\n```");
  });

  it("detects code render mode for wrapped nl read command", () => {
    const meta = inferCommandOutputRenderMeta(
      `/bin/zsh -lc "zsh -lc 'source ~/.zshrc && nl -ba src/main/java/com/example/demo/NewsController.java'"`,
      "1 public class NewsController {}",
    );
    expect(meta.mode).toBe("code");
    expect(meta.language).toBe("java");
  });

  it("detects code render mode for wrapped xml file read command", () => {
    const meta = inferCommandOutputRenderMeta(
      `/bin/zsh -lc "zsh -lc 'source ~/.zshrc && cat pom.xml'"`,
      '<?xml version="1.0" encoding="UTF-8"?><project></project>',
    );
    expect(meta.mode).toBe("code");
    expect(meta.language).toBe("markup");
    expect(meta.filePath).toBe("pom.xml");
  });

  it("renders prefixed line numbers as separate code line-number token", () => {
    const html = renderCodeOutputHtml("12 import java.util.List;", "java");
    expect(html).toContain("session-activity-code-line-number");
    expect(html).toContain('class="token');
  });
});
