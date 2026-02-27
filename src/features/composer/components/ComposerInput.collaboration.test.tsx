// @vitest-environment jsdom
import { createRef, type ComponentProps } from "react";
import { act, fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

    const selectTrigger = within(view.container).getByLabelText("composer.collaborationMode");
    expect((selectTrigger as HTMLButtonElement).disabled).toBe(false);
    expect(within(view.container).getByText("composer.collaborationPlanInlineHint")).toBeTruthy();
  });

  it("hides collaboration mode entry for non-codex engines", () => {
    const view = renderComposerInput({ selectedEngine: "claude", collaborationModesEnabled: true });

    expect(within(view.container).queryByLabelText("Collaboration mode")).toBeNull();
  });

  it("renders fallback options when presets are temporarily unavailable", async () => {
    const view = renderComposerInput({
      collaborationModesEnabled: true,
      collaborationModes: [],
      selectedCollaborationModeId: "code",
    });

    const selectTrigger = within(view.container).getByLabelText("composer.collaborationMode");
    expect((selectTrigger as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      fireEvent.pointerDown(selectTrigger);
      fireEvent.click(selectTrigger);
    });
    const popup = document.body.querySelector("[data-slot='select-popup']");
    if (!popup) {
      throw new Error("Select popup not found");
    }
    const optionText = Array.from(
      popup.querySelectorAll("[data-slot='select-item']"),
    )
      .map((item) => item.textContent ?? "")
      .join(" | ");
    expect(optionText).toMatch(/composer\.collaborationCode|code/i);
    expect(optionText).toMatch(/composer\.collaborationPlan|plan/i);
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
