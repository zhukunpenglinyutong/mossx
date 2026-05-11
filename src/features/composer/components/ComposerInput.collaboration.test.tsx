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
  it("shows plan mode switch for codex engine", () => {
    const view = renderComposerInput({ collaborationModesEnabled: false });

    const modeSwitch = within(view.container).getByRole("switch", {
      name: "composer.planModeToggle",
    });
    expect(modeSwitch).toBeTruthy();
    expect(modeSwitch.getAttribute("aria-checked")).toBe("false");
  });

  it("hides plan mode switch for non-codex engines", () => {
    const view = renderComposerInput({ selectedEngine: "claude", collaborationModesEnabled: true });

    expect(within(view.container).queryByRole("switch", { name: "composer.planModeToggle" })).toBeNull();
  });

  it("switches from default(code) to plan", () => {
    const onSelectCollaborationMode = vi.fn();
    const view = renderComposerInput({
      selectedCollaborationModeId: "code",
      onSelectCollaborationMode,
    });

    const modeSwitch = within(view.container).getByRole("switch", {
      name: "composer.planModeToggle",
    });
    fireEvent.click(modeSwitch);

    expect(onSelectCollaborationMode).toHaveBeenCalledWith("plan");
  });

  it("switches from plan to default(code)", () => {
    const onSelectCollaborationMode = vi.fn();
    const view = renderComposerInput({
      selectedCollaborationModeId: "plan",
      onSelectCollaborationMode,
    });

    const modeSwitch = within(view.container).getByRole("switch", {
      name: "composer.planModeToggle",
    });
    fireEvent.click(modeSwitch);

    expect(onSelectCollaborationMode).toHaveBeenCalledWith("code");
  });

  it("shows Claude default copy for an empty Claude reasoning effort", () => {
    const view = renderComposerInput({
      selectedEngine: "claude",
      reasoningSupported: true,
      reasoningOptions: ["low", "medium", "high", "xhigh", "max"],
      selectedEffort: null,
      onSelectEffort: vi.fn(),
    });

    expect(within(view.container).getAllByText("reasoning.claudeDefault").length).toBeGreaterThan(0);
  });
});
