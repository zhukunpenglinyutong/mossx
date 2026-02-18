// @vitest-environment jsdom
import { createRef, type ComponentProps } from "react";
import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComposerInput } from "./ComposerInput";

function renderComposerInput(overrides: Partial<ComponentProps<typeof ComposerInput>> = {}) {
  const textareaRef = createRef<HTMLTextAreaElement>();
  return render(
    <ComposerInput
      text=""
      disabled={false}
      sendLabel="Send"
      canStop={false}
      canSend={false}
      isProcessing={false}
      onStop={() => {}}
      onSend={() => {}}
      onTextChange={() => {}}
      onSelectionChange={() => {}}
      onKeyDown={() => {}}
      textareaRef={textareaRef}
      suggestionsOpen={false}
      suggestions={[]}
      highlightIndex={0}
      onHighlightIndex={() => {}}
      onSelectSuggestion={() => {}}
      selectedEngine="codex"
      collaborationModes={[]}
      collaborationModesEnabled={false}
      selectedCollaborationModeId={null}
      onSelectCollaborationMode={() => {}}
      {...overrides}
    />,
  );
}

describe("ComposerInput collaboration mode", () => {
  it("keeps collaboration entry enabled for codex even when feature toggle is off", () => {
    const view = renderComposerInput({ collaborationModesEnabled: false });

    const select = within(view.container).getByLabelText("composer.collaborationMode");
    expect(select.getAttribute("disabled")).toBeNull();
    expect((select as HTMLSelectElement).value).toBe("plan");
    expect(within(view.container).getByText("composer.collaborationPlanInlineHint")).toBeTruthy();
  });

  it("hides collaboration mode entry for non-codex engines", () => {
    const view = renderComposerInput({ selectedEngine: "claude", collaborationModesEnabled: true });

    expect(within(view.container).queryByLabelText("Collaboration mode")).toBeNull();
  });

  it("allows selecting fallback mode when presets are temporarily unavailable", () => {
    const onSelectCollaborationMode = vi.fn();
    const view = renderComposerInput({
      collaborationModesEnabled: true,
      collaborationModes: [],
      selectedCollaborationModeId: "code",
      onSelectCollaborationMode,
    });

    const select = within(view.container).getByLabelText("composer.collaborationMode");
    expect(select.getAttribute("disabled")).toBeNull();

    fireEvent.change(select, { target: { value: "plan" } });
    expect(onSelectCollaborationMode).toHaveBeenCalledWith("plan");
  });

  it("shows inline plan hint inside the mode selector label", () => {
    const view = renderComposerInput({
      collaborationModesEnabled: true,
      collaborationModes: [
        { id: "code", label: "Code" },
        { id: "plan", label: "Plan" },
      ],
      selectedCollaborationModeId: "plan",
    });

    expect(within(view.container).getByText("composer.collaborationPlanInlineHint")).toBeTruthy();
  });

  it("shows inline code hint inside the mode selector label", () => {
    const view = renderComposerInput({
      collaborationModesEnabled: true,
      collaborationModes: [
        { id: "code", label: "Code" },
        { id: "plan", label: "Plan" },
      ],
      selectedCollaborationModeId: "code",
    });

    expect(within(view.container).getByText("Code · directly implement code changes")).toBeTruthy();
  });
});
