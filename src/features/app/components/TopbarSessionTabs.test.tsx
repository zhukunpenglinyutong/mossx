// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopbarSessionTabs } from "./TopbarSessionTabs";

describe("TopbarSessionTabs", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when tab count is 0", () => {
    const { container } = render(
      <TopbarSessionTabs
        tabs={[]}
        ariaLabel="sessions"
        onSelectThread={vi.fn()}
        onCloseThread={vi.fn()}
        onShowTabMenu={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders normally when there is exactly one tab", () => {
    render(
      <TopbarSessionTabs
        tabs={[
          {
            workspaceId: "w1",
            threadId: "t1",
            label: "Only Session",
            displayLabel: "Only...",
            engineType: "codex",
            engineLabel: "Codex",
            isActive: true,
          },
        ]}
        ariaLabel="sessions"
        onSelectThread={vi.fn()}
        onCloseThread={vi.fn()}
        onShowTabMenu={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Codex · Only Session" })).toBeTruthy();
  });

  it("renders tabs, sends click only for non-active items, and supports close action", () => {
    const onSelectThread = vi.fn();
    const onCloseThread = vi.fn();
    render(
      <TopbarSessionTabs
        ariaLabel="sessions"
        onSelectThread={onSelectThread}
        onCloseThread={onCloseThread}
        onShowTabMenu={vi.fn()}
        tabs={[
          {
            workspaceId: "w1",
            threadId: "t1",
            label: "First Session",
            displayLabel: "Firs...",
            engineType: "codex",
            engineLabel: "Codex",
            isActive: true,
          },
          {
            workspaceId: "w2",
            threadId: "t2",
            label: "Second Session",
            displayLabel: "Seco...",
            engineType: "claude",
            engineLabel: "Claude",
            isActive: false,
          },
        ]}
      />,
    );

    const first = screen.getByRole("tab", { name: "Codex · First Session" });
    const second = screen.getByRole("tab", { name: "Claude · Second Session" });
    expect(first.getAttribute("data-tauri-drag-region")).toBe("false");
    expect(second.getAttribute("data-tauri-drag-region")).toBe("false");
    expect(screen.getByText("Firs...")).toBeTruthy();
    expect(screen.getByText("Seco...")).toBeTruthy();

    fireEvent.click(first);
    fireEvent.click(second);
    fireEvent.click(screen.getByRole("button", { name: "Close Second Session" }));

    expect(onSelectThread).toHaveBeenCalledTimes(1);
    expect(onSelectThread).toHaveBeenCalledWith("w2", "t2");
    expect(onCloseThread).toHaveBeenCalledTimes(1);
    expect(onCloseThread).toHaveBeenCalledWith("w2", "t2");
  });

  it("supports Space/Spacebar keyboard activation and does not bubble close keydown", () => {
    const onSelectThread = vi.fn();
    const onCloseThread = vi.fn();
    const onShowTabMenu = vi.fn();
    render(
      <TopbarSessionTabs
        ariaLabel="sessions"
        onSelectThread={onSelectThread}
        onCloseThread={onCloseThread}
        onShowTabMenu={onShowTabMenu}
        tabs={[
          {
            workspaceId: "w2",
            threadId: "t2",
            label: "Second Session",
            displayLabel: "Seco...",
            engineType: "claude",
            engineLabel: "Claude",
            isActive: false,
          },
        ]}
      />,
    );

    const tab = screen.getByRole("tab", { name: "Claude · Second Session" });
    fireEvent.keyDown(tab, { key: "Spacebar" });
    fireEvent.keyDown(tab, { key: "Space" });
    expect(onSelectThread).toHaveBeenCalledWith("w2", "t2");
    expect(onSelectThread).toHaveBeenCalledTimes(2);

    const closeButton = screen.getByRole("button", { name: "Close Second Session" });
    fireEvent.keyDown(closeButton, { key: "Spacebar" });
    fireEvent.keyDown(closeButton, { key: "Space" });
    expect(onSelectThread).toHaveBeenCalledTimes(2);
    expect(onCloseThread).toHaveBeenCalledTimes(0);
    expect(onShowTabMenu).toHaveBeenCalledTimes(0);
  });

  it("opens the context menu for the targeted tab", () => {
    const onShowTabMenu = vi.fn();
    render(
      <TopbarSessionTabs
        ariaLabel="sessions"
        onSelectThread={vi.fn()}
        onCloseThread={vi.fn()}
        onShowTabMenu={onShowTabMenu}
        tabs={[
          {
            workspaceId: "w2",
            threadId: "t2",
            label: "Second Session",
            displayLabel: "Seco...",
            engineType: "claude",
            engineLabel: "Claude",
            isActive: false,
          },
        ]}
      />,
    );

    const tab = screen.getByRole("tab", { name: "Claude · Second Session" });
    fireEvent.contextMenu(tab);

    expect(onShowTabMenu).toHaveBeenCalledTimes(1);
    expect(onShowTabMenu).toHaveBeenCalledWith(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      "w2",
      "t2",
    );
  });

  it("supports keyboard context-menu triggers for Windows-style interaction", () => {
    const onShowTabMenu = vi.fn();
    render(
      <TopbarSessionTabs
        ariaLabel="sessions"
        onSelectThread={vi.fn()}
        onCloseThread={vi.fn()}
        onShowTabMenu={onShowTabMenu}
        tabs={[
          {
            workspaceId: "w2",
            threadId: "t2",
            label: "Second Session",
            displayLabel: "Seco...",
            engineType: "claude",
            engineLabel: "Claude",
            isActive: false,
          },
        ]}
      />,
    );

    const tab = screen.getByRole("tab", { name: "Claude · Second Session" });
    fireEvent.keyDown(tab, { key: "ContextMenu" });
    fireEvent.keyDown(tab, { key: "F10", shiftKey: true });

    expect(onShowTabMenu).toHaveBeenCalledTimes(2);
  });
});
