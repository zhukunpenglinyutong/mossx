// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LaunchScriptEntry } from "../../../types";
import { LaunchScriptEntryButton } from "./LaunchScriptEntryButton";

const entry: LaunchScriptEntry = {
  id: "entry-1",
  script: "npm run dev",
  icon: "play",
  label: "Dev",
};

describe("LaunchScriptEntryButton", () => {
  it("does not close editor when interacting inside popover", () => {
    const onCloseEditor = vi.fn();
    render(
      <LaunchScriptEntryButton
        entry={entry}
        editorOpen
        draftScript={entry.script}
        draftIcon={entry.icon}
        draftLabel={entry.label ?? ""}
        isSaving={false}
        error={null}
        onRun={vi.fn()}
        onOpenEditor={vi.fn()}
        onCloseEditor={onCloseEditor}
        onDraftChange={vi.fn()}
        onDraftIconChange={vi.fn()}
        onDraftLabelChange={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.pointerDown(screen.getByPlaceholderText("例如 npm run dev"));

    expect(onCloseEditor).not.toHaveBeenCalled();
  });
});
