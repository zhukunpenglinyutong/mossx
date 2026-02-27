// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../../types";
import { GenericToolBlock } from "./GenericToolBlock";

const askUserItem: Extract<ConversationItem, { kind: "tool" }> = {
  id: "tool-1",
  kind: "tool",
  toolType: "toolCall",
  title: "Tool: askuserquestion",
  detail: "{}",
};

const fileChangeItem: Extract<ConversationItem, { kind: "tool" }> = {
  id: "tool-2",
  kind: "tool",
  toolType: "fileChange",
  title: "File changes",
  detail: "{}",
  status: "completed",
  changes: [
    { path: "src/App.tsx", kind: "modified", diff: "@@ -1 +1 @@\n-old\n+new" },
    { path: "src/New.tsx", kind: "added", diff: "@@ -0,0 +1 @@\n+const x = 1;" },
  ],
};

const fileChangeWithOutputItem: Extract<ConversationItem, { kind: "tool" }> = {
  id: "tool-2-output",
  kind: "tool",
  toolType: "fileChange",
  title: "File changes",
  detail: "{}",
  status: "completed",
  output: "@@ -1 +1 @@\n-old\n+new",
  changes: [
    { path: "src/App.tsx", kind: "modified", diff: "@@ -1 +1 @@\n-old\n+new" },
  ],
};

const markdownOutputItem: Extract<ConversationItem, { kind: "tool" }> = {
  id: "tool-3",
  kind: "tool",
  toolType: "fileChange",
  title: "File changes",
  detail: "{}",
  status: "completed",
  output: "## Summary\n\n| Name | Value |\n| --- | --- |\n| a | b |",
};

const blockedModeItem: Extract<ConversationItem, { kind: "tool" }> = {
  id: "tool-4",
  kind: "tool",
  toolType: "modeBlocked",
  title: "Tool: askuserquestion",
  detail: "item/tool/requestUserInput",
  status: "completed",
  output:
    "requestUserInput is blocked while effective_mode=code\n\nSwitch to Plan mode and resend the prompt when user input is needed.",
};

describe("GenericToolBlock", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows plan-mode hint for askuserquestion in code mode", () => {
    render(
      <GenericToolBlock
        item={askUserItem}
        isExpanded={false}
        onToggle={vi.fn()}
        activeCollaborationModeId="code"
      />,
    );

    expect(screen.getByText("This feature requires Plan mode")).toBeTruthy();
  });

  it("hides plan-mode hint when collaboration mode is plan", () => {
    render(
      <GenericToolBlock
        item={askUserItem}
        isExpanded={false}
        onToggle={vi.fn()}
        activeCollaborationModeId="plan"
      />,
    );

    expect(screen.queryByText("This feature requires Plan mode")).toBeNull();
  });

  it("shows blocked suggestion for modeBlocked askuserquestion item", () => {
    const view = render(
      <GenericToolBlock
        item={blockedModeItem}
        isExpanded={false}
        onToggle={vi.fn()}
        activeCollaborationModeId="code"
      />,
    );

    expect(screen.getByText("This feature requires Plan mode")).toBeTruthy();
    const header = view.container.querySelector(".task-header");
    expect(header).toBeTruthy();
    if (header) {
      fireEvent.click(header);
    }
    const rawPre = view.container.querySelector(".tool-output-raw-pre");
    expect(rawPre?.textContent ?? "").toContain("Switch to Plan mode");
  });

  it("shows file-change summary and detail metrics", () => {
    render(
      <GenericToolBlock
        item={fileChangeItem}
        isExpanded
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getAllByText("2 files").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-1").length).toBeGreaterThan(0);
    expect(screen.getByText("A 1")).toBeTruthy();
    expect(screen.getByText("M 1")).toBeTruthy();
    expect(screen.getByText("-0")).toBeTruthy();
    expect(screen.getAllByText("+1").length).toBeGreaterThan(1);
  });

  it("keeps only file list for file changes and hides raw diff output", () => {
    render(
      <GenericToolBlock
        item={fileChangeWithOutputItem}
        isExpanded
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("App.tsx")).toBeTruthy();
    expect(document.querySelector(".tool-output-raw-pre")).toBeNull();
    expect(screen.queryByText("@@ -1 +1 @@")).toBeNull();
  });

  it("keeps markdown-like output in raw text mode", () => {
    render(
      <GenericToolBlock
        item={markdownOutputItem}
        isExpanded
        onToggle={vi.fn()}
      />,
    );
    const rawPre = document.querySelector(".tool-output-raw-pre");
    expect(rawPre).toBeTruthy();
    const rawText = rawPre?.textContent ?? "";
    expect(rawText).toContain("## Summary");
    expect(rawText).toContain("| Name | Value |");
  });
});
