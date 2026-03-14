// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionActivityEvent } from "../../session-activity/types";
import { useLiveEditPreview } from "./useLiveEditPreview";

function createFileChangeEvent(overrides: Partial<SessionActivityEvent> = {}): SessionActivityEvent {
  return {
    eventId: "file:file-1",
    threadId: "thread-1",
    threadName: "Root session",
    sessionRole: "root",
    relationshipSource: "directParent",
    kind: "fileChange",
    occurredAt: 10,
    summary: "File change · src/App.tsx",
    status: "completed",
    jumpTarget: { type: "diff", path: "src/App.tsx" },
    filePath: "src/App.tsx",
    ...overrides,
  };
}

describe("useLiveEditPreview", () => {
  it("opens the newest file-change path when preview is enabled", () => {
    const onOpenFile = vi.fn();

    renderHook(() =>
      useLiveEditPreview({
        enabled: true,
        timeline: [createFileChangeEvent()],
        centerMode: "chat",
        activeEditorFilePath: null,
        onOpenFile,
      }),
    );

    expect(onOpenFile).toHaveBeenCalledWith("src/App.tsx");
  });

  it("respects manual navigation pause before taking over again", () => {
    vi.useFakeTimers();
    const onOpenFile = vi.fn();
    const firstEvent = createFileChangeEvent();
    const secondEvent = createFileChangeEvent({
      eventId: "file:file-2",
      filePath: "src/feature.ts",
      jumpTarget: { type: "diff", path: "src/feature.ts" },
      summary: "File change · src/feature.ts",
      occurredAt: 20,
    });

    const { result, rerender } = renderHook(
      ({
        timeline,
      }: {
        timeline: SessionActivityEvent[];
      }) =>
        useLiveEditPreview({
          enabled: true,
          timeline,
          centerMode: "chat",
          activeEditorFilePath: null,
          onOpenFile,
          manualPauseMs: 4_000,
        }),
      {
        initialProps: { timeline: [firstEvent] },
      },
    );

    expect(onOpenFile).toHaveBeenCalledWith("src/App.tsx");

    act(() => {
      result.current.markManualNavigation();
      rerender({ timeline: [secondEvent, firstEvent] });
    });

    expect(onOpenFile).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(4_100);
      rerender({
        timeline: [
          createFileChangeEvent({
            eventId: "file:file-3",
            filePath: "src/final.ts",
            jumpTarget: { type: "diff", path: "src/final.ts" },
            summary: "File change · src/final.ts",
            occurredAt: 30,
          }),
          secondEvent,
          firstEvent,
        ],
      });
    });

    expect(onOpenFile).toHaveBeenLastCalledWith("src/final.ts");
    vi.useRealTimers();
  });

  it("throttles bursty file changes to the latest target", () => {
    vi.useFakeTimers();
    const onOpenFile = vi.fn();
    const firstEvent = createFileChangeEvent();
    const secondEvent = createFileChangeEvent({
      eventId: "file:file-2",
      filePath: "src/second.ts",
      jumpTarget: { type: "diff", path: "src/second.ts" },
      summary: "File change · src/second.ts",
      occurredAt: 20,
    });

    const { rerender } = renderHook(
      ({
        timeline,
      }: {
        timeline: SessionActivityEvent[];
      }) =>
        useLiveEditPreview({
          enabled: true,
          timeline,
          centerMode: "chat",
          activeEditorFilePath: null,
          onOpenFile,
          throttleMs: 900,
        }),
      {
        initialProps: { timeline: [firstEvent] },
      },
    );

    expect(onOpenFile).toHaveBeenCalledTimes(1);

    act(() => {
      rerender({ timeline: [secondEvent, firstEvent] });
    });

    expect(onOpenFile).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(901);
    });

    expect(onOpenFile).toHaveBeenCalledTimes(2);
    expect(onOpenFile).toHaveBeenLastCalledWith("src/second.ts");
    vi.useRealTimers();
  });

  it("does not reopen the same file when the editor is already showing it", () => {
    const onOpenFile = vi.fn();

    renderHook(() =>
      useLiveEditPreview({
        enabled: true,
        timeline: [createFileChangeEvent()],
        centerMode: "editor",
        activeEditorFilePath: "src/App.tsx",
        onOpenFile,
      }),
    );

    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("ignores running file-change events until they are completed", () => {
    const onOpenFile = vi.fn();

    const { rerender } = renderHook(
      ({ timeline }: { timeline: SessionActivityEvent[] }) =>
        useLiveEditPreview({
          enabled: true,
          timeline,
          centerMode: "chat",
          activeEditorFilePath: null,
          onOpenFile,
        }),
      {
        initialProps: {
          timeline: [createFileChangeEvent({ status: "running" })],
        },
      },
    );

    expect(onOpenFile).not.toHaveBeenCalled();

    rerender({
      timeline: [createFileChangeEvent({ eventId: "file:file-2", status: "completed" })],
    });

    expect(onOpenFile).toHaveBeenCalledWith("src/App.tsx");
  });
});
