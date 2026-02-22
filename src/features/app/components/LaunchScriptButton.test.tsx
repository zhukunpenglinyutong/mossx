// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LaunchScriptButton } from "./LaunchScriptButton";

describe("LaunchScriptButton", () => {
  it("does not close editor when interacting inside popover", () => {
    const onCloseEditor = vi.fn();
    render(
      <LaunchScriptButton
        launchScript={null}
        editorOpen
        draftScript=""
        isSaving={false}
        error={null}
        onRun={vi.fn()}
        onOpenEditor={vi.fn()}
        onCloseEditor={onCloseEditor}
        onDraftChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    fireEvent.pointerDown(screen.getByPlaceholderText("例如 npm run dev"));

    expect(onCloseEditor).not.toHaveBeenCalled();
  });

  it("ignores pointer events whose target is not a Node", () => {
    const onCloseEditor = vi.fn();
    render(
      <LaunchScriptButton
        launchScript={null}
        editorOpen
        draftScript=""
        isSaving={false}
        error={null}
        onRun={vi.fn()}
        onOpenEditor={vi.fn()}
        onCloseEditor={onCloseEditor}
        onDraftChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    window.dispatchEvent(new PointerEvent("pointerdown"));

    expect(onCloseEditor).not.toHaveBeenCalled();
  });
});
