// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown file links", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("routes absolute file links to the file opener callback", () => {
    const onOpenFileLink = vi.fn();

    render(
      <Markdown
        value={
          "文件: [collaboration_policy.rs](/Users/test/Library/Application%20Support/repo/src-tauri/src/codex/collaboration_policy.rs#L42)"
        }
        onOpenFileLink={onOpenFileLink}
      />,
    );

    fireEvent.click(
      screen.getByRole("link", { name: "collaboration_policy.rs" }),
    );

    expect(onOpenFileLink).toHaveBeenCalledWith(
      "/Users/test/Library/Application Support/repo/src-tauri/src/codex/collaboration_policy.rs#L42",
    );
  });

  it("renders image tags declared with <image>url</image>", () => {
    const { container } = render(<Markdown value="<image>https://example.com/a.png</image>" />);

    const img = container.querySelector("img") as HTMLImageElement | null;
    expect(img).toBeTruthy();
    if (!img) {
      return;
    }
    expect(img.src).toContain("https://example.com/a.png");
  });

  it("does not transform <image> tag inside code fences", () => {
    const { container } = render(
      <Markdown
        value={"```text\n<image>https://example.com/a.png</image>\n```"}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByText("<image>https://example.com/a.png</image>"),
    ).toBeTruthy();
  });

  it("does not transform <image> tag inside inline code spans", () => {
    const { container } = render(
      <Markdown
        value={"路径是 `<image>https://example.com/a.png</image>`"}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByText("<image>https://example.com/a.png</image>"),
    ).toBeTruthy();
  });

  it("preserves fragmented inline code content during markdown normalization", () => {
    const { container } = render(
      <Markdown value={"命令是 `pnpm\nrun\nlint`，执行后继续。"} />,
    );

    const code = container.querySelector("code");
    expect(code?.textContent ?? "").toBe("pnpm run lint");
    expect(container.textContent ?? "").not.toContain("pnpmrunlint");
  });

  it("flushes the latest content immediately when streaming throttle changes", () => {
    vi.useFakeTimers();
    const { rerender, container } = render(
      <Markdown
        value="draft"
        streamingThrottleMs={120}
      />,
    );

    rerender(
      <Markdown
        value="draft update"
        streamingThrottleMs={120}
      />,
    );
    expect(container.textContent ?? "").toContain("draft");
    expect(container.textContent ?? "").not.toContain("draft update");

    act(() => {
      rerender(
        <Markdown
          value="final answer"
          streamingThrottleMs={80}
        />,
      );
    });

    expect(container.textContent ?? "").toContain("final answer");
  });

  it("reports the exact rendered streaming value after throttle flushes", () => {
    vi.useFakeTimers();
    const onRenderedValueChange = vi.fn();
    const { rerender } = render(
      <Markdown
        value="draft"
        streamingThrottleMs={120}
        onRenderedValueChange={onRenderedValueChange}
      />,
    );

    expect(onRenderedValueChange).toHaveBeenLastCalledWith("draft");

    rerender(
      <Markdown
        value="draft update"
        streamingThrottleMs={120}
        onRenderedValueChange={onRenderedValueChange}
      />,
    );
    expect(onRenderedValueChange).not.toHaveBeenLastCalledWith("draft update");

    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(onRenderedValueChange).toHaveBeenLastCalledWith("draft update");
  });
});
