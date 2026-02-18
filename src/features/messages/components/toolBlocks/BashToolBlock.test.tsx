// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../../types";
import { BashToolBlock } from "./BashToolBlock";

const failedCommandItem: Extract<ConversationItem, { kind: "tool" }> = {
  id: "bash-tool-1",
  kind: "tool",
  toolType: "commandExecution",
  title: "Command: npm run test",
  detail: '{"command":"npm run test"}',
  status: "failed",
  output: "Error: test failed",
};

describe("BashToolBlock", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows failed output even when collapsed and highlights error lines", () => {
    render(
      <BashToolBlock
        item={failedCommandItem}
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );

    const errorLine = screen.getByText("Error: test failed");
    expect(errorLine).toBeTruthy();
    expect(errorLine.className).toContain("bash-output-line-error");
  });

  it("shows command section and copy action when expanded", () => {
    render(
      <BashToolBlock
        item={failedCommandItem}
        isExpanded
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("tools.executeCommand")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "messages.copy" }).length).toBeGreaterThan(0);
  });

  it("keeps markdown-like output as raw text", () => {
    const markdownOutputItem: Extract<ConversationItem, { kind: "tool" }> = {
      ...failedCommandItem,
      id: "bash-tool-md",
      status: "completed",
      output: "## Title\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
    };
    render(
      <BashToolBlock
        item={markdownOutputItem}
        isExpanded
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("## Title")).toBeTruthy();
    expect(screen.getByText("| A | B |")).toBeTruthy();
  });
});
