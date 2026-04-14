// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown math rendering", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders inline and display LaTeX formulas", () => {
    const value = [
      "行内公式：$a^2 + b^2 = c^2$",
      "",
      "$$",
      "\\int_0^1 x^2 \\, dx = \\frac{1}{3}",
      "$$",
    ].join("\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelector(".katex")).toBeTruthy();
    expect(container.querySelector(".katex-display")).toBeTruthy();
  });

  it("normalizes codex-style parentheses delimiters for inline formulas", () => {
    const value = [
      "逻辑函数：\\( \\sigma(z)=\\frac{1}{1+e^{-z}} \\)",
      "样本均值（ \\bar{x}=\\frac{1}{n}\\sum_{i=1}^{n}x_i ）",
    ].join("\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
  });

  it("renders dedicated latex fenced blocks with formula preview", () => {
    const value = [
      "```latex",
      "% 1) 二次方程求根公式",
      "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
      "",
      "% 2) 欧拉公式",
      "e^{i\\pi} + 1 = 0",
      "```",
    ].join("\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelector(".markdown-latexblock")).toBeTruthy();
    expect(container.querySelector(".markdown-latexblock-label")?.textContent).toContain("1) 二次方程求根公式");
    expect(container.querySelectorAll(".markdown-latexblock .katex-display").length).toBeGreaterThanOrEqual(2);
  });
});
