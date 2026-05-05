// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  LightweightMarkdown,
  resolveAdaptiveProgressiveRevealStepMs,
  resolveProgressiveRevealValue,
} from "./LiveMarkdown";

describe("LightweightMarkdown", () => {
  it("keeps stable blocks mounted while append-only streaming extends the tail", () => {
    const initialValue = [
      "### 第一部分",
      "",
      "- 第一条",
      "- 第二条",
      "",
      "尾段还在继续",
    ].join("\n");
    const nextValue = `${initialValue}\n继续补充这一段的后续内容`;

    const { container, rerender } = render(
      <LightweightMarkdown value={initialValue} />,
    );

    const stableHeadingNode = container.querySelector("h3");
    const stableListNode = container.querySelector("ul");

    expect(stableHeadingNode?.textContent).toBe("第一部分");
    expect(stableListNode?.textContent).toContain("第一条");

    rerender(<LightweightMarkdown value={nextValue} />);

    expect(container.querySelector("h3")).toBe(stableHeadingNode);
    expect(container.querySelector("ul")).toBe(stableListNode);
    expect(container.textContent).toContain("继续补充这一段的后续内容");
  });

  it("widens the reveal chunk when a long stream falls behind in the tail", () => {
    const visibleValue = `${"段落内容\n".repeat(900)}`;
    const targetValue = `${visibleValue}${"### 小节\n- 条目\n".repeat(220)}`;

    const nextValue = resolveProgressiveRevealValue(
      visibleValue,
      targetValue,
      360,
    );

    expect(nextValue.length).toBeGreaterThan(visibleValue.length + 720);
    expect(nextValue.length).toBeLessThan(targetValue.length);
  });

  it("relaxes reveal cadence and flushes immediately for extreme tail backlog", () => {
    const visibleValue = `${"段落内容\n".repeat(1_600)}`;
    const targetValue = `${visibleValue}${"### 小节\n- 条目\n".repeat(900)}`;

    expect(
      resolveAdaptiveProgressiveRevealStepMs(
        visibleValue.length,
        targetValue.length - visibleValue.length,
        28,
      ),
    ).toBeGreaterThan(28);
    expect(resolveProgressiveRevealValue(visibleValue, targetValue, 360)).toBe(targetValue);
  });
});
