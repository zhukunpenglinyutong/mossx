// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown fenced block rendering", () => {
  it("renders fenced markdown blocks as rich markdown cards", () => {
    const value = [
      "```markdown",
      "> [!TIP]",
      "> **Spring Boot Demo**",
      ">",
      "> - `mvn test` 已通过",
      "```",
    ].join("\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelector(".markdown-codeblock-markdown")).toBeTruthy();
    expect(container.querySelector(".markdown-codeblock-language")?.textContent).toBe("MARKDOWN");
    expect(container.querySelector("blockquote.markdown-alert-tip")).toBeTruthy();
    expect(container.querySelector(".markdown-alert-label-tip")?.textContent).toBe("TIP");
    expect(
      container.querySelector(".markdown-codeblock-markdown-content strong")?.textContent,
    ).toBe("Spring Boot Demo");
    expect(
      container.querySelector(".markdown-codeblock-markdown-content code")?.textContent,
    ).toBe("mvn test");
    expect(container.textContent).not.toContain("[!TIP]");
  });

  it("preserves file link actions inside rendered markdown code blocks", () => {
    const onOpenFileLink = vi.fn();
    const value = [
      "```markdown",
      "[spec.md](/Users/test/project/openspec/spec.md#L12)",
      "```",
    ].join("\n");

    render(
      <Markdown
        value={value}
        className="markdown"
        codeBlockStyle="message"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "spec.md" }));

    expect(onOpenFileLink).toHaveBeenCalledWith(
      "/Users/test/project/openspec/spec.md#L12",
    );
  });

  it("keeps nested markdown fences as literal code examples", () => {
    const value = [
      "示例：",
      "",
      "1. 以下内容应该保留为源码：",
      "",
      "   ```markdown",
      "   # Demo Title",
      "   - item",
      "   ```",
    ].join("\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelector(".markdown-codeblock-markdown")).toBeNull();
    expect(container.querySelector(".markdown-codeblock")).toBeTruthy();
    expect(container.querySelector("h1")).toBeNull();
    expect(container.textContent).toContain("# Demo Title");
  });

  it("renders multiline code blocks with per-line selection wrappers", () => {
    const value = [
      "```text",
      "first line",
      "second line",
      "```",
    ].join("\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    const lines = container.querySelectorAll(".markdown-codeblock-line");
    expect(lines).toHaveLength(2);
    expect(lines[0]?.textContent).toBe("first line");
    expect(lines[1]?.textContent).toBe("second line");
  });
});
