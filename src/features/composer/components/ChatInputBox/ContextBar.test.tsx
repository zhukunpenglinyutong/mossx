// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextBar } from "./ContextBar";

describe("ContextBar live canvas controls visibility", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.removeItem("ccgui.messages.live.autoFollow");
    window.localStorage.removeItem("ccgui.messages.live.collapseMiddleSteps");
  });

  it("shows output collapse controls in history mode when there are messages", () => {
    const { container } = render(
      <ContextBar
        isLoading={false}
        hasMessages
        showStatusPanelToggle
      />,
    );

    expect(container.querySelector(".context-live-canvas-controls")).toBeTruthy();
    expect(container.querySelector(".context-live-canvas-btn--focus-follow")).toBeNull();
    expect(container.querySelector(".context-live-canvas-btn")).toBeTruthy();
  });

  it("hides output collapse controls when idle and no messages", () => {
    const { container } = render(
      <ContextBar
        isLoading={false}
        hasMessages={false}
        showStatusPanelToggle
      />,
    );

    expect(container.querySelector(".context-live-canvas-controls")).toBeNull();
  });

  it("external surface keeps context chips outside while moving action tools away", () => {
    const { container } = render(
      <ContextBar
        surface="external"
        activeFile="/workspace/src/App.tsx"
        selectedContextChips={[{ type: "skill", name: "ui-design" }]}
        isLoading={false}
        hasMessages
        currentProvider="codex"
        onAddAttachment={vi.fn()}
        onRewind={vi.fn()}
        showRewindEntry
        showStatusPanelToggle
        onToggleStatusPanel={vi.fn()}
      />,
    );

    expect(screen.getByText("ui-design")).toBeTruthy();
    expect(screen.getByText("App.tsx")).toBeTruthy();
    expect(screen.queryByText("statusPanel.label")).toBeNull();
    expect(container.querySelector(".context-tool-btn .codicon-attach")).toBeNull();
    expect(container.querySelector(".context-live-canvas-controls")).toBeNull();
    expect(container.querySelector(".context-rewind-btn")).toBeNull();
  });

  it("disables rewind while conversation is in progress", () => {
    const onRewind = vi.fn();
    const { container } = render(
      <ContextBar
        isLoading
        hasMessages
        currentProvider="claude"
        onRewind={onRewind}
        showRewindEntry
      />,
    );

    const rewindButton = container.querySelector(".context-rewind-btn") as HTMLButtonElement | null;

    expect(rewindButton).toBeTruthy();
    expect(rewindButton?.hasAttribute("disabled")).toBe(true);

    rewindButton?.click();
    expect(onRewind).not.toHaveBeenCalled();
  });

  it("shows rewind for codex provider when enabled", () => {
    const { container } = render(
      <ContextBar
        isLoading={false}
        hasMessages
        currentProvider="codex"
        onRewind={vi.fn()}
        showRewindEntry
      />,
    );

    const rewindButton = container.querySelector(".context-rewind-btn");
    expect(rewindButton).toBeTruthy();
  });

  it("renders the completion email toggle in the bottom context bar", () => {
    const onToggleCompletionEmail = vi.fn();

    const { rerender } = render(
      <ContextBar
        isLoading={false}
        hasMessages
        onToggleCompletionEmail={onToggleCompletionEmail}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: "composer.completionEmailAriaLabel",
    });
    expect(toggle.closest(".context-bar")).toBeTruthy();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    toggle.click();
    expect(onToggleCompletionEmail).toHaveBeenCalledTimes(1);

    rerender(
      <ContextBar
        isLoading={false}
        hasMessages
        completionEmailSelected
        completionEmailDisabled
        onToggleCompletionEmail={onToggleCompletionEmail}
      />,
    );

    const selectedToggle = screen.getByRole("button", {
      name: "composer.completionEmailSelected",
    }) as HTMLButtonElement;
    expect(selectedToggle.getAttribute("aria-pressed")).toBe("true");
    expect(selectedToggle.disabled).toBe(true);
  });

  it("renders Codex auto-compaction controls inside the context tooltip", () => {
    const onCodexAutoCompactionSettingsChange = vi.fn();

    const { rerender } = render(
      <ContextBar
        currentProvider="codex"
        contextDualViewEnabled
        dualContextUsage={{
          usedTokens: 50,
          contextWindow: 100,
          percent: 50,
          hasUsage: true,
          compactionState: "idle",
          compactionSource: null,
          usageSyncPendingAfterCompaction: false,
        }}
        codexAutoCompactionEnabled={false}
        codexAutoCompactionThresholdPercent={150}
        onCodexAutoCompactionSettingsChange={onCodexAutoCompactionSettingsChange}
      />,
    );

    const toggle = screen.getByLabelText("chat.contextDualViewAutoCompactionEnabled");
    const threshold = screen.getByLabelText("chat.contextDualViewAutoCompactionThreshold") as HTMLSelectElement;

    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(threshold.value).toBe("150");
    expect(threshold.disabled).toBe(true);

    fireEvent.click(toggle);
    expect(onCodexAutoCompactionSettingsChange).toHaveBeenCalledWith({ enabled: true });

    rerender(
      <ContextBar
        currentProvider="codex"
        contextDualViewEnabled
        dualContextUsage={{
          usedTokens: 50,
          contextWindow: 100,
          percent: 50,
          hasUsage: true,
          compactionState: "idle",
          compactionSource: null,
          usageSyncPendingAfterCompaction: false,
        }}
        codexAutoCompactionEnabled
        codexAutoCompactionThresholdPercent={150}
        onCodexAutoCompactionSettingsChange={onCodexAutoCompactionSettingsChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("chat.contextDualViewAutoCompactionThreshold"), {
      target: { value: "180" },
    });
    expect(onCodexAutoCompactionSettingsChange).toHaveBeenCalledWith({ thresholdPercent: 180 });
  });

  it("shows the real Codex context usage percent while filling the ring at 100 percent", () => {
    const { container } = render(
      <ContextBar
        currentProvider="codex"
        contextDualViewEnabled
        dualContextUsage={{
          usedTokens: 130,
          contextWindow: 100,
          percent: 100,
          hasUsage: true,
          compactionState: "idle",
          compactionSource: null,
          usageSyncPendingAfterCompaction: false,
        }}
      />,
    );

    expect(screen.getAllByText("130%").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("0%")).toBeTruthy();

    const ring = container.querySelector(".context-dual-usage-ring") as HTMLElement | null;
    expect(ring?.style.getPropertyValue("--dual-usage-percent")).toBe("100%");
  });

  it("shows sync-pending copy after automatic compaction completes before usage refresh", () => {
    render(
      <ContextBar
        currentProvider="codex"
        contextDualViewEnabled
        dualContextUsage={{
          usedTokens: 140,
          contextWindow: 100,
          percent: 100,
          hasUsage: true,
          compactionState: "compacted",
          compactionSource: "auto",
          usageSyncPendingAfterCompaction: true,
        }}
      />,
    );

    expect(screen.getByText("chat.contextDualViewCompactedPendingSyncAuto")).toBeTruthy();
  });

  it("does not render unknown Claude context usage as zero percent", () => {
    const { container } = render(
      <ContextBar
        currentProvider="claude"
        percentage={null}
        claudeContextUsage={{
          usedTokens: null,
          contextWindow: null,
          totalTokens: null,
          inputTokens: null,
          cachedInputTokens: null,
          outputTokens: null,
          usedPercent: null,
          remainingPercent: null,
          freshness: "pending",
          source: null,
          hasUsage: false,
        }}
      />,
    );

    expect(container.querySelector(".token-percentage-label")).toBeNull();
    expect(screen.queryByText("0%")).toBeNull();
    expect(screen.getByText("chat.claudeContextFreshness.pending")).toBeTruthy();
  });

  it("renders Claude live context usage with Codex-like density but no compaction controls", () => {
    render(
      <ContextBar
        currentProvider="claude"
        percentage={65}
        usedTokens={167_800}
        maxTokens={258_400}
        claudeContextUsage={{
          usedTokens: 167_800,
          contextWindow: 258_400,
          totalTokens: 570_400,
          inputTokens: 400_000,
          cachedInputTokens: 20_000,
          outputTokens: 150_400,
          usedPercent: 65,
          remainingPercent: 35,
          freshness: "live",
          source: "context_window",
          hasUsage: true,
          categoryUsages: [
            { name: "System prompt", tokens: 1_600, percent: 0.8 },
            { name: "Memory files", tokens: 6_700, percent: 3.3 },
          ],
          toolUsages: [
            { name: "mcp__one", server: "srv", tokens: 3_000 },
            { name: "mcp__two", server: "srv", tokens: 2_000 },
            { name: "mcp__three", server: "srv", tokens: 1_000 },
          ],
          toolUsagesTruncated: true,
        }}
      />,
    );

    expect(screen.getAllByText("65%").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("35%")).toBeTruthy();
    expect(screen.getByText("570.4k")).toBeTruthy();
    const totalBreakdown = screen.getByText(
      "chat.claudeContextInputDetail · chat.claudeContextOutputDetail",
    );
    expect(screen.getByText("chat.claudeContextCachedExcludedDetail")).toBeTruthy();
    const windowBreakdown = screen.getByText(
      "chat.claudeContextInputDetail + chat.claudeContextCachedDetail",
    );
    expect(totalBreakdown.closest(".context-dual-tooltip-note--detail")).toBeTruthy();
    expect(windowBreakdown.closest(".context-dual-tooltip-note--detail")).toBeTruthy();
    expect(screen.getByText("167.8k / 258.4k")).toBeTruthy();
    expect(screen.getByText("chat.claudeContextCategoryTitle")).toBeTruthy();
    expect(screen.getByText("System prompt")).toBeTruthy();
    expect(screen.getByText("Memory files")).toBeTruthy();
    expect(screen.getByText("0.8%")).toBeTruthy();
    expect(screen.getByText("3.3%")).toBeTruthy();
    expect(document.querySelector(".claude-context-category-grid")).toBeTruthy();
    expect(screen.queryByText("chat.claudeContextMcpToolsTitle")).toBeNull();
    expect(screen.queryByText("mcp__one: 3k · mcp__two: 2k · mcp__three: 1k · ...")).toBeNull();
    expect(screen.queryByLabelText("chat.contextDualViewAutoCompactionEnabled")).toBeNull();
    expect(screen.getByText("chat.claudeContextFreshness.live")).toBeTruthy();
  });

  it("labels Claude estimated window usage instead of waiting for CLI telemetry", () => {
    render(
      <ContextBar
        currentProvider="claude"
        percentage={null}
        claudeContextUsage={{
          usedTokens: 266_100,
          contextWindow: null,
          totalTokens: 89_600,
          inputTokens: 88_600,
          cachedInputTokens: 177_500,
          outputTokens: 1_000,
          usedPercent: null,
          remainingPercent: null,
          freshness: "estimated",
          source: "message_usage",
          hasUsage: true,
        }}
      />,
    );

    expect(screen.getByText("chat.claudeContextWindowEstimatedTokens")).toBeTruthy();
    expect(screen.getByText("chat.claudeContextCachedExcludedDetail")).toBeTruthy();
    expect(screen.queryByText("chat.claudeContextUnavailable")).toBeNull();
  });
});
