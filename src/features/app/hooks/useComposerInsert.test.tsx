// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useComposerInsert } from "./useComposerInsert";

describe("useComposerInsert", () => {
  it("applies consecutive inserts on latest text snapshot", () => {
    const onDraftChange = vi.fn();
    const textarea = document.createElement("textarea");
    const textareaRef = { current: textarea };

    const { result } = renderHook(() =>
      useComposerInsert({
        activeThreadId: "thread-1",
        draftText: "",
        onDraftChange,
        textareaRef,
      }),
    );

    act(() => {
      result.current("first");
      result.current("second");
    });

    expect(onDraftChange).toHaveBeenNthCalledWith(1, "first");
    expect(onDraftChange).toHaveBeenNthCalledWith(2, "first second");
  });

  it("does nothing when there is no active thread", () => {
    const onDraftChange = vi.fn();
    const textarea = document.createElement("textarea");
    const textareaRef = { current: textarea };

    const { result } = renderHook(() =>
      useComposerInsert({
        activeThreadId: null,
        draftText: "",
        onDraftChange,
        textareaRef,
      }),
    );

    act(() => {
      result.current("ignored");
    });

    expect(onDraftChange).not.toHaveBeenCalled();
  });
});
