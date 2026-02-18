// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../../types";
import { BashToolGroupBlock } from "./BashToolGroupBlock";

const makeToolItem = (
  id: string,
  command: string,
  output: string,
  status: Extract<ConversationItem, { kind: "tool" }>["status"] = "completed",
): Extract<ConversationItem, { kind: "tool" }> => ({
  id,
  kind: "tool",
  toolType: "commandExecution",
  title: `Command: ${command}`,
  detail: JSON.stringify({ command }),
  status,
  output,
});

describe("BashToolGroupBlock", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders batch outputs in stacked lines when one item is expanded", () => {
    render(
      <BashToolGroupBlock
        items={[
          makeToolItem("bash-group-1", "npm run lint", "first line\nsecond line\nError: failed"),
          makeToolItem("bash-group-2", "npm run test", "ok"),
        ]}
      />,
    );

    fireEvent.click(screen.getByText("npm run lint"));

    const outputLines = document.querySelectorAll(".bash-output-line");
    expect(outputLines.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("first line")).toBeTruthy();
    expect(screen.getByText("second line")).toBeTruthy();
    const errorLine = screen.getByText("Error: failed");
    expect(errorLine.className).toContain("bash-output-line-error");
  });
});
