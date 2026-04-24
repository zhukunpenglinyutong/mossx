// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("renders codex-style over-escaped delimiters mixed with dollar math", () => {
    const value = [
      String.raw`Codex 常见输出：\\( \sigma(z)=\frac{1}{1+e^{-z}} \\)，并混用 $x_t=\beta x_{t-1}$。`,
      String.raw`\\[`,
      String.raw`\mathcal{L}(\theta)=\sum_{i=1}^{n}(y_i-\hat{y}_i)^2`,
      String.raw`\\]`,
      "结尾说明文本。",
    ].join("\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector(".katex-display")).toBeTruthy();
    expect(container.textContent).not.toContain("\\[");
    expect(container.textContent).not.toContain("\\]");
  });

  it("supports mixed single and double backslash inline delimiters in one sentence", () => {
    const value = String.raw`混合分隔符：\\(a_i=b_i+1\\)，\(c_i=d_i+1\)，以及 $e_i=f_i+1$。`;

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(3);
  });

  it("renders prose that mixes $...$, $$...$$, \\(...\\), and \\[...\\]", () => {
    const value = [
      "模型训练中，我们常写 $L(\\theta)=\\frac{1}{n}\\sum_{i=1}^{n}\\ell_i$，也会写成 \\( p(y\\mid x)=\\frac{e^{f_y(x)}}{\\sum_j e^{f_j(x)}} \\)。",
      "接着给出块级写法：",
      "$$\\min_{\\theta}\\;\\mathcal{L}(\\theta)+\\lambda\\|\\theta\\|_2^2$$",
      "另一种块级分隔符也可直接写在正文流中：",
      "\\[\\int_0^1 x^2\\,dx=\\frac{1}{3}\\]",
      "最后回到自然语言结论。",
    ].join("\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(4);
    expect(container.querySelectorAll(".katex-display").length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toContain("最后回到自然语言结论");
  });

  it("renders codex list prose that embeds $$...$$ and \\[...\\] without katex errors", () => {
    const value = [
      "2. 对于线性系统 $Ax=b$，若 \\(A\\in\\mathbb{R}^{n\\times n}\\) 可逆，则解唯一且为 \\(x=A^{-1}b\\)；误差传播通常记为 $$ \\frac{\\|\\delta x\\|}{\\|x\\|}\\le \\kappa(A)\\frac{\\|\\delta b\\|}{\\|b\\|} $$，其中条件数定义为 \\[ \\kappa(A)=\\|A\\|\\,\\|A^{-1}\\|. \\]",
      "3. 在凸优化问题 $ \\min_{x\\in\\mathcal{X}} f(x) $ 中，若 \\(f\\) 为可微凸函数，则一阶最优性条件为 $$ \\langle \\nabla f(x^\\*),x-x^\\*\\rangle\\ge 0,\\ \\forall x\\in\\mathcal{X} $$；无约束情形可简化为 \\[ \\nabla f(x^\\*)=0. \\]",
    ].join("\n\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelector(".katex-error")).toBeFalsy();
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(4);
  });

  it("downgrades malformed $$...$$ prose blocks and keeps inner inline math renderable", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const value = String.raw`说明：$$一步，在热点 key 下把冲突概率从 $p$ 降到 $p' \approx \frac{p}{s}$，可得到更高吞吐。$$`;

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelector(".katex-error")).toBeFalsy();
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
    consoleWarnSpy.mockRestore();
  });

  it("extracts leading bare latex before cjk prose into display math", () => {
    const value = String.raw`\mathcal{L}_{total}=\mathcal{L}_{queue}+\mathcal{L}_{retry}+\mathcal{L}_{io}, \qquad \mathcal{L}_{retry}=\sum_{i=1}^{m} b_i. 在热点 key 下继续分片。`;

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelector(".katex-display")).toBeTruthy();
    expect(container.textContent).toContain("在热点 key 下继续分片");
  });

  it("preserves function-style parentheses inside valid inline formulas", () => {
    const value = "梯度流：$\\frac{d\\theta}{dt}=-\\nabla_\\theta \\mathcal{L}(\\theta)$。";

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    const paragraph = container.querySelector("p");
    expect(container.querySelector(".katex")).toBeTruthy();
    expect(paragraph?.lastChild?.textContent).toBe("。");
  });

  it("promotes standalone bare latex lines inside prose to display math", () => {
    const value = [
      "如果把神经网络训练看成一个动力系统，那么最基础的梯度流可以写成",
      "\\frac{d\\theta}{dt}=-\\nabla_\\theta \\mathcal{L}(\\theta)",
      "更新也常写成",
      "v_{t+1}=\\beta v_t-\\eta \\nabla_\\theta \\mathcal{L}(\\theta_t), \\qquad \\theta_{t+1}=\\theta_t+v_{t+1}",
    ].join("\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelectorAll(".katex-display").length).toBeGreaterThanOrEqual(2);
  });

  it("renders standalone single-line double-dollar formulas as display math", () => {
    const value = [
      "经验风险最小化常写成",
      "$$\\hat{R}(f)=\\frac{1}{n}\\sum_{i=1}^{n}\\ell(f(x_i), y_i)$$",
      "这个公式衡量经验分布上的平均损失。",
    ].join("\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelector(".katex-display")).toBeTruthy();
  });

  it("keeps standalone single-dollar formulas renderable without wrapping them twice", () => {
    const value = [
      "后验概率满足",
      "$P(\\theta \\mid D)=\\frac{P(D\\mid \\theta)P(\\theta)}{P(D)}$,",
      "这是 Bayes 公式的标准写法。",
    ].join("\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelector(".katex")).toBeTruthy();
    expect(container.textContent).not.toContain("$P(\\theta");
  });

  it("does not parse inline formula when closing dollar is escaped", () => {
    const value = "这是原始文本：$a\\$";

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelector(".katex")).toBeFalsy();
    expect(container.textContent).toContain("这是原始文本");
    expect(container.textContent).toContain("a\\");
  });

  it("parses inline formula when closing dollar has an even backslash prefix", () => {
    const value = "双反斜杠场景：$a\\\\$";

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelector(".katex")).toBeTruthy();
  });

  it("keeps indented formulas renderable inside ordered lists", () => {
    const value = [
      "1. 贝叶斯公式",
      "   P(\\theta\\mid D)=\\frac{P(D\\mid \\theta)P(\\theta)}{P(D)}",
      "",
      "2. 经验风险最小化",
      "   $$\\hat{R}(f)=\\frac{1}{n}\\sum_{i=1}^{n}\\ell(f(x_i), y_i)$$",
    ].join("\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelectorAll(".katex-display").length).toBeGreaterThanOrEqual(2);
  });

  it("does not double-wrap existing multi-line display math blocks", () => {
    const value = [
      "1. 定义如下：",
      "   $$",
      "   \\int_0^1 x^2 \\, dx = \\frac{1}{3}",
      "   $$",
    ].join("\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelectorAll(".katex-display").length).toBe(1);
  });

  it("renders latex fenced blocks even when the source includes outer delimiters", () => {
    const value = [
      "```latex",
      "$$ \\frac{d}{dx}x^2 = 2x $$",
      "```",
    ].join("\n");

    const { container } = render(
      <Markdown value={value} className="markdown" codeBlockStyle="message" />,
    );

    expect(container.querySelector(".markdown-latexblock .katex-display")).toBeTruthy();
    expect(container.textContent).not.toContain("$$ \\frac{d}{dx}x^2 = 2x $$");
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
