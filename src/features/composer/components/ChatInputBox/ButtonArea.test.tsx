// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../../types/provider";
import { ButtonArea } from "./ButtonArea";

vi.mock("./selectors", () => ({
  ConfigSelect: () => <div data-testid="config-select" />,
  ModelSelect: ({ models }: { models: Array<{ id: string }> }) => (
    <div data-testid="model-select">{models.map((model) => model.id).join(",")}</div>
  ),
  ModeSelect: () => <div data-testid="mode-select" />,
  ProviderSelect: () => <div data-testid="provider-select" />,
  ReasoningSelect: () => <div data-testid="reasoning-select" />,
  ShortcutActionsSelect: () => <div data-testid="shortcut-actions-select" />,
}));

describe("ButtonArea custom model storage refresh", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("refreshes the rendered model list after same-tab custom model updates", async () => {
    render(
      <ButtonArea
        currentProvider="claude"
        models={[]}
        selectedModel=""
        hasInputContent
        onSubmit={vi.fn()}
        shortcutActions={[]}
      />,
    );

    expect(screen.getByTestId("model-select").textContent).not.toContain("claude-custom-alpha");

    act(() => {
      window.localStorage.setItem(
        STORAGE_KEYS.CLAUDE_CUSTOM_MODELS,
        JSON.stringify([{ id: "claude-custom-alpha", label: "Claude Custom Alpha" }]),
      );
      window.dispatchEvent(
        new CustomEvent("localStorageChange", {
          detail: { key: STORAGE_KEYS.CLAUDE_CUSTOM_MODELS },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("model-select").textContent).toContain("claude-custom-alpha");
    });
  });
});
