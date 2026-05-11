// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GlobalRuntimeNoticeDock } from "./GlobalRuntimeNoticeDock";

describe("GlobalRuntimeNoticeDock", () => {
  it("renders the minimized entry as a compact exclamation trigger when notices exist", () => {
    const onExpand = vi.fn();

    render(
      <GlobalRuntimeNoticeDock
        notices={[
          {
            id: "notice-1",
            severity: "info",
            category: "bootstrap",
            messageKey: "runtimeNotice.bootstrap.starting",
            messageParams: {},
            timestampMs: Date.now(),
            repeatCount: 1,
            dedupeKey: "bootstrap:start",
          },
        ]}
        visibility="minimized"
        status="streaming"
        onExpand={onExpand}
        onMinimize={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开运行时提示" }));

    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".global-runtime-notice-dock-indicator-mark")?.textContent).toBe(
      "!",
    );
    expect(document.querySelector(".global-runtime-notice-dock-indicator-dot")).toBeNull();
    expect(screen.queryByText("运行中")).toBeNull();
  });

  it("renders a green dot when minimized and truly idle", () => {
    render(
      <GlobalRuntimeNoticeDock
        notices={[
          {
            id: "notice-idle",
            severity: "info",
            category: "runtime",
            messageKey: "runtimeNotice.runtime.ready",
            messageParams: {
              workspace: "Repo A",
              engine: "Codex",
            },
            timestampMs: Date.now(),
            repeatCount: 1,
            dedupeKey: "runtime:repo-a:ready",
          },
        ]}
        visibility="minimized"
        status="idle"
        onExpand={vi.fn()}
        onMinimize={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(document.querySelector(".global-runtime-notice-dock-indicator-dot")).toBeTruthy();
    expect(document.querySelector(".global-runtime-notice-dock-indicator-mark")).toBeNull();
  });

  it("keeps the minimized exclamation when the dock has errors", () => {
    render(
      <GlobalRuntimeNoticeDock
        notices={[
          {
            id: "notice-error",
            severity: "error",
            category: "runtime",
            messageKey: "runtimeNotice.runtime.quarantined",
            messageParams: {
              workspace: "Repo A",
              engine: "Codex",
            },
            timestampMs: Date.now(),
            repeatCount: 1,
            dedupeKey: "runtime:repo-a:quarantined",
          },
        ]}
        visibility="minimized"
        status="has-error"
        onExpand={vi.fn()}
        onMinimize={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(document.querySelector(".global-runtime-notice-dock-indicator-mark")?.textContent).toBe(
      "!",
    );
    expect(document.querySelector(".global-runtime-notice-dock-indicator-dot")).toBeNull();
  });

  it("renders the expanded empty state contract", () => {
    render(
      <GlobalRuntimeNoticeDock
        notices={[]}
        visibility="expanded"
        status="idle"
        onExpand={vi.fn()}
        onMinimize={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByText("运行时提示")).toBeTruthy();
    expect(screen.getByText("空闲")).toBeTruthy();
    expect(screen.getByText("暂无运行时提示")).toBeTruthy();
    expect(screen.getByText("初始化进度和关键错误会显示在这里")).toBeTruthy();
  });

  it("renders one-line notice rows with timestamp, repeat count, and actions", () => {
    const onClear = vi.fn();
    const onMinimize = vi.fn();

    render(
      <GlobalRuntimeNoticeDock
        notices={[
          {
            id: "notice-1",
            severity: "error",
            category: "workspace",
            messageKey: "runtimeNotice.error.createSessionRecoveryRequired",
            messageParams: { workspace: "Repo A" },
            timestampMs: new Date("2026-04-22T09:08:07").getTime(),
            repeatCount: 2,
            dedupeKey: "workspace:error:repo-a",
          },
        ]}
        visibility="expanded"
        status="has-error"
        onExpand={vi.fn()}
        onMinimize={onMinimize}
        onClear={onClear}
      />,
    );

    expect(
      screen.getByText("Repo A：会话创建失败，运行时正在恢复 ×2"),
    ).toBeTruthy();
    expect(screen.getByText("09:08:07")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "清空" }));
    fireEvent.click(screen.getByRole("button", { name: "最小化" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onMinimize).toHaveBeenCalledTimes(1);
  });

  it("renders startup loading notices with the expanded dock surface", () => {
    render(
      <GlobalRuntimeNoticeDock
        notices={[
          {
            id: "startup-notice",
            severity: "info",
            category: "diagnostic",
            messageKey: "runtimeNotice.startup.taskStarted",
            messageParams: {
              task: "Load active workspace threads",
              phase: "active-workspace",
              workspace: "ws-1",
            },
            timestampMs: new Date("2026-04-22T09:10:11").getTime(),
            repeatCount: 1,
            dedupeKey: "startup:task:ws-1",
          },
        ]}
        visibility="expanded"
        status="streaming"
        onExpand={vi.fn()}
        onMinimize={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(
      screen.getByText("后台加载开始：Load active workspace threads（active-workspace / ws-1）"),
    ).toBeTruthy();
    expect(document.querySelector(".global-runtime-notice-dock")).toBeTruthy();
  });
});
