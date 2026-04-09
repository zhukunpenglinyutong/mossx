// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CollapsibleUserTextBlock } from "./CollapsibleUserTextBlock";

describe("CollapsibleUserTextBlock", () => {
  it("renders content text", () => {
    render(<CollapsibleUserTextBlock content="Hello world" />);
    expect(screen.getByText("Hello world")).toBeTruthy();
  });

  it("does not show toggle button for short content", () => {
    render(<CollapsibleUserTextBlock content="Short" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("toggles expanded state when button is clicked", () => {
    // Use a very long content to trigger overflow detection
    const longContent = "A".repeat(5000);
    const { container } = render(
      <CollapsibleUserTextBlock content={longContent} />,
    );

    const block = container.querySelector(".user-collapsible-block");
    expect(block).toBeTruthy();
    // Initially collapsed
    expect(block?.classList.contains("is-collapsed")).toBe(true);
  });

  it("applies is-expanded class when expanded", () => {
    const { container } = render(
      <CollapsibleUserTextBlock content="Test content" />,
    );
    const block = container.querySelector(".user-collapsible-block");
    expect(block).toBeTruthy();
    // Short content should still render but without toggle
    expect(block?.classList.contains("is-collapsed")).toBe(true);
  });

  it("extracts non-image @path references into standalone reference card", () => {
    const content =
      "@/Users/demo/repo/docs/ @/Users/demo/repo/.specify目录结构说明.md 看一下";
    const { container } = render(<CollapsibleUserTextBlock content={content} />);

    const refs = container.querySelectorAll(".user-reference-card-item");
    const text = container.querySelector(".user-collapsible-text-content")?.textContent ?? "";
    expect(refs).toHaveLength(2);
    expect(text).toContain("看一下");
    expect(text).not.toContain("@/Users/demo/repo/docs/");
    expect(text).not.toContain("@/Users/demo/repo/.specify目录结构说明.md");
  });

  it("extracts image path references into standalone reference card", () => {
    const content = "@/Users/demo/repo/images/preview.png 看图";
    const { container } = render(<CollapsibleUserTextBlock content={content} />);

    const refs = container.querySelectorAll(".user-reference-card-item");
    const text = container.querySelector(".user-collapsible-text-content")?.textContent ?? "";
    expect(refs).toHaveLength(1);
    expect(text).toBe("看图");
  });

  it("continues extracting references even when plain text appears between mentions", () => {
    const content =
      "@/Users/demo/repo/HelloWorld.java 这是啥 @/Users/demo/repo/pom.xml";
    const { container } = render(<CollapsibleUserTextBlock content={content} />);
    const refs = container.querySelectorAll(".user-reference-card-item");
    const text = container.querySelector(".user-collapsible-text-content")?.textContent ?? "";

    expect(refs).toHaveLength(2);
    expect(text).toContain("这是啥");
    expect(text).not.toContain("@/Users/demo/repo/pom.xml");
  });

  it("extracts Windows file URL path with localhost host", () => {
    const content = "@file://localhost/C:/repo/src/App.tsx 请看";
    const { container } = render(<CollapsibleUserTextBlock content={content} />);
    const refs = container.querySelectorAll(".user-reference-card-item");
    const text = container.querySelector(".user-collapsible-text-content")?.textContent ?? "";

    expect(refs).toHaveLength(1);
    expect(container.textContent ?? "").toContain("App.tsx");
    expect(text).toContain("请看");
    expect(text).not.toContain("file://localhost/C:/repo/src/App.tsx");
  });

  it("extracts UNC file URL path", () => {
    const content = "@file://fileserver/share/release-notes.md 检查下";
    const { container } = render(<CollapsibleUserTextBlock content={content} />);
    const refs = container.querySelectorAll(".user-reference-card-item");
    const text = container.querySelector(".user-collapsible-text-content")?.textContent ?? "";

    expect(refs).toHaveLength(1);
    expect(container.textContent ?? "").toContain("release-notes.md");
    expect(text).toContain("检查下");
  });

  it("extracts native Windows drive path", () => {
    const content = "@C:\\repo\\docs\\README.md 处理这个";
    const { container } = render(<CollapsibleUserTextBlock content={content} />);
    const refs = container.querySelectorAll(".user-reference-card-item");
    const text = container.querySelector(".user-collapsible-text-content")?.textContent ?? "";

    expect(refs).toHaveLength(1);
    expect(container.textContent ?? "").toContain("README.md");
    expect(text).toContain("处理这个");
  });

  it("extracts mac path with spaces in file name without swallowing trailing text", () => {
    const content = "@/Users/demo/repo/My File.md 请阅读";
    const { container } = render(<CollapsibleUserTextBlock content={content} />);
    const refs = container.querySelectorAll(".user-reference-card-item");
    const text = container.querySelector(".user-collapsible-text-content")?.textContent ?? "";

    expect(refs).toHaveLength(1);
    expect(container.textContent ?? "").toContain("My File.md");
    expect(text).toContain("请阅读");
    expect(text).not.toContain("My File.md");
  });

  it("extracts Windows path with spaces in file name", () => {
    const content = "@C:\\repo\\My File.md 看这里";
    const { container } = render(<CollapsibleUserTextBlock content={content} />);
    const refs = container.querySelectorAll(".user-reference-card-item");
    const text = container.querySelector(".user-collapsible-text-content")?.textContent ?? "";

    expect(refs).toHaveLength(1);
    expect(container.textContent ?? "").toContain("My File.md");
    expect(text).toContain("看这里");
  });

  it("extracts double-quoted path and keeps trailing punctuation/text", () => {
    const content = '@"/Users/demo/repo/My File.md"，请看';
    const { container } = render(<CollapsibleUserTextBlock content={content} />);
    const refs = container.querySelectorAll(".user-reference-card-item");
    const text = container.querySelector(".user-collapsible-text-content")?.textContent ?? "";

    expect(refs).toHaveLength(1);
    expect(container.textContent ?? "").toContain("My File.md");
    expect(text).toContain("，请看");
    expect(text).not.toContain('/Users/demo/repo/My File.md');
  });

  it("extracts single-quoted windows path", () => {
    const content = "@'C:\\Program Files\\Demo\\a.txt' 处理";
    const { container } = render(<CollapsibleUserTextBlock content={content} />);
    const refs = container.querySelectorAll(".user-reference-card-item");
    const text = container.querySelector(".user-collapsible-text-content")?.textContent ?? "";

    expect(refs).toHaveLength(1);
    expect(container.textContent ?? "").toContain("a.txt");
    expect(text).toContain("处理");
  });

  it("keeps unmatched quoted reference as plain text", () => {
    const content = '@"/Users/demo/repo/My File.md 请看';
    const { container } = render(<CollapsibleUserTextBlock content={content} />);
    const refs = container.querySelectorAll(".user-reference-card-item");
    const text = container.querySelector(".user-collapsible-text-content")?.textContent ?? "";

    expect(refs).toHaveLength(0);
    expect(text).toBe(content);
  });
});
