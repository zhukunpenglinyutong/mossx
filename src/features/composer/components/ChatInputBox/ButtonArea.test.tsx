// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../../types/provider";
import { ButtonArea } from "./ButtonArea";

vi.mock("./selectors", () => ({
  ConfigSelect: () => <div data-testid="config-select" />,
  ModelSelect: ({
    models,
    onAddModel,
    onRefreshConfig,
    isRefreshingConfig,
  }: {
    models: Array<{ id: string; model?: string; label?: string; source?: string }>;
    onAddModel?: () => void;
    onRefreshConfig?: () => void;
    isRefreshingConfig?: boolean;
  }) => (
    <div>
      <div data-testid="model-select">
        {models.map((model) => `${model.id}:${model.model ?? ""}:${model.source ?? ""}:${model.label ?? model.id}`).join(",")}
      </div>
      {onAddModel && (
        <button type="button" data-testid="model-add" onClick={onAddModel}>
          add
        </button>
      )}
      {onRefreshConfig && (
        <button type="button" data-testid="model-refresh" onClick={onRefreshConfig}>
          refresh
        </button>
      )}
      <span data-testid="model-refreshing">{isRefreshingConfig ? "yes" : "no"}</span>
    </div>
  ),
  ModeSelect: () => <div data-testid="mode-select" />,
  ProviderSelect: () => <div data-testid="provider-select" />,
  ReasoningSelect: ({
    value,
    options,
    showDefaultOption,
    defaultLabel,
    onChange,
  }: {
    value: string | null;
    options?: string[];
    showDefaultOption?: boolean;
    defaultLabel?: string;
    onChange?: (value: string | null) => void;
  }) => (
    <div data-testid="reasoning-select">
      <span data-testid="reasoning-value">{value ?? ""}</span>
      <span data-testid="reasoning-options">{(options ?? []).join(",")}</span>
      <span data-testid="reasoning-default">{showDefaultOption ? defaultLabel : ""}</span>
      <button type="button" data-testid="reasoning-pick-high" onClick={() => onChange?.("high")}>
        high
      </button>
      <button type="button" data-testid="reasoning-pick-default" onClick={() => onChange?.(null)}>
        default
      </button>
    </div>
  ),
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

  it("filters invalid Claude custom model ids before they reach the selector", async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.CLAUDE_CUSTOM_MODELS,
      JSON.stringify([
        { id: "bad model with spaces", label: "Bad" },
        { id: "Cxn[1m]", label: "Cxn[1m]" },
      ]),
    );

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

    const modelList = screen.getByTestId("model-select").textContent ?? "";

    expect(modelList).toContain("Cxn[1m]:Cxn[1m]:custom:Cxn[1m]");
    expect(modelList).not.toContain("bad model with spaces");
  });

  it("does not render Claude alias fallback when config and custom models are empty", () => {
    render(
      <ButtonArea
        currentProvider="claude"
        models={[]}
        selectedModel="sonnet"
        hasInputContent
        onSubmit={vi.fn()}
        shortcutActions={[]}
      />,
    );

    const modelList = screen.getByTestId("model-select").textContent ?? "";

    expect(modelList).not.toContain("sonnet:Sonnet");
    expect(modelList).not.toContain("opus:Opus");
    expect(modelList).not.toContain("haiku:Haiku");
    expect(modelList).not.toContain("claude-sonnet-4-6");
  });

  it("does not duplicate Codex models when the parent already passes a hydrated catalog", () => {
    render(
      <ButtonArea
        currentProvider="codex"
        models={[
          {
            id: "gpt-5.5",
            model: "gpt-5.5",
            label: "gpt-5.5 (config)",
            source: "settings-override",
          },
          {
            id: "demo",
            model: "demo",
            label: "Demo",
            source: "custom",
          },
          {
            id: "gpt-5.3-codex-spark",
            model: "gpt-5.3-codex-spark",
            label: "gpt-5.3-codex-spark",
            source: "catalog",
          },
        ]}
        selectedModel="gpt-5.5"
        hasInputContent
        onSubmit={vi.fn()}
        shortcutActions={[]}
      />,
    );

    const modelList = screen.getByTestId("model-select").textContent ?? "";
    const modelEntries = modelList.split(",").filter(Boolean);

    expect(modelList).toContain("gpt-5.5:gpt-5.5:settings-override:gpt-5.5 (config)");
    expect(modelList).toContain("demo:demo:custom:Demo");
    expect(modelList).toContain("gpt-5.3-codex-spark:gpt-5.3-codex-spark:catalog:gpt-5.3-codex-spark");
    expect(modelEntries.filter((entry) => entry.startsWith("gpt-5.5:"))).toHaveLength(1);
    expect(modelEntries.filter((entry) => entry.startsWith("demo:"))).toHaveLength(1);
    expect(modelList).not.toContain("gpt-5.4");
  });

  it("falls back to built-in Codex models when the parent provides none", () => {
    render(
      <ButtonArea
        currentProvider="codex"
        models={[]}
        selectedModel=""
        hasInputContent
        onSubmit={vi.fn()}
        shortcutActions={[]}
      />,
    );

    const modelList = screen.getByTestId("model-select").textContent ?? "";

    expect(modelList).toContain("gpt-5.5:::gpt-5.5");
    expect(modelList).toContain("gpt-5.4:::gpt-5.4");
    expect(modelList).toContain("gpt-5.3-codex:::gpt-5.3-codex");
  });

  it("keeps custom Codex model labels while deduplicating built-in matches", () => {
    window.localStorage.setItem(
      STORAGE_KEYS.CODEX_CUSTOM_MODELS,
      JSON.stringify([{ id: "gpt-5.4", label: "My GPT 5.4" }]),
    );

    render(
      <ButtonArea
        currentProvider="codex"
        models={[]}
        selectedModel=""
        hasInputContent
        onSubmit={vi.fn()}
        shortcutActions={[]}
      />,
    );

    const modelList = screen.getByTestId("model-select").textContent ?? "";

    expect(modelList).toContain("gpt-5.4:::My GPT 5.4");
    expect(modelList.match(/gpt-5\.4:/g)).toHaveLength(1);
    expect(modelList).toContain("gpt-5.5:::gpt-5.5");
  });

  it("renders Claude reasoning selector with Claude default state", () => {
    render(
      <ButtonArea
        currentProvider="claude"
        models={[]}
        selectedModel=""
        reasoningEffort={null}
        reasoningOptions={["low", "medium", "high", "xhigh", "max"]}
        hasInputContent
        onSubmit={vi.fn()}
        onReasoningChange={vi.fn()}
        shortcutActions={[]}
      />,
    );

    expect(screen.getByTestId("reasoning-select")).toBeTruthy();
    expect(screen.getByTestId("reasoning-value").textContent).toBe("");
    expect(screen.getByTestId("reasoning-options").textContent).toBe("low,medium,high,xhigh,max");
    expect(screen.getByTestId("reasoning-default").textContent).toBe("reasoning.claudeDefault");
  });

  it("does not render reasoning selector for Gemini", () => {
    render(
      <ButtonArea
        currentProvider="gemini"
        models={[]}
        selectedModel=""
        hasInputContent
        onSubmit={vi.fn()}
        onReasoningChange={vi.fn()}
        shortcutActions={[]}
      />,
    );

    expect(screen.queryByTestId("reasoning-select")).toBeNull();
  });

  it("keeps the existing Codex reasoning selector without a default reset option", () => {
    render(
      <ButtonArea
        currentProvider="codex"
        models={[]}
        selectedModel=""
        reasoningEffort="high"
        reasoningOptions={["medium", "high"]}
        hasInputContent
        onSubmit={vi.fn()}
        onReasoningChange={vi.fn()}
        shortcutActions={[]}
      />,
    );

    expect(screen.getByTestId("reasoning-select")).toBeTruthy();
    expect(screen.getByTestId("reasoning-value").textContent).toBe("high");
    expect(screen.getByTestId("reasoning-options").textContent).toBe("medium,high");
    expect(screen.getByTestId("reasoning-default").textContent).toBe("");
  });

  it("does not apply legacy Claude mapping to dynamic backend models", () => {
    window.localStorage.setItem(
      STORAGE_KEYS.CLAUDE_MODEL_MAPPING,
      JSON.stringify({ sonnet: "MiniMax-M3[1m]", opus: "MiniMax-M4[1m]" }),
    );

    render(
      <ButtonArea
        currentProvider="claude"
        models={[
          {
            id: "settings-main",
            label: "MiniMax-M1[1m]",
          },
          {
            id: "claude-sonnet-4-6",
            label: "Sonnet",
          },
        ]}
        selectedModel="settings-main"
        hasInputContent
        onSubmit={vi.fn()}
        shortcutActions={[]}
      />,
    );

    const modelList = screen.getByTestId("model-select").textContent ?? "";

    expect(modelList).toContain("settings-main:::MiniMax-M1[1m]");
    expect(modelList).toContain("claude-sonnet-4-6:::Sonnet");
    expect(modelList).not.toContain("MiniMax-M3[1m]");
    expect(modelList).not.toContain("MiniMax-M4[1m]");
  });

  it("routes add model and refresh config actions to the current provider", () => {
    const onAddModel = vi.fn();
    const onRefreshModelConfig = vi.fn();

    render(
      <ButtonArea
        currentProvider="gemini"
        models={[]}
        selectedModel=""
        hasInputContent
        onSubmit={vi.fn()}
        onAddModel={onAddModel}
        onRefreshModelConfig={onRefreshModelConfig}
        isModelConfigRefreshing
        shortcutActions={[]}
      />,
    );

    act(() => {
      screen.getByTestId("model-add").click();
      screen.getByTestId("model-refresh").click();
    });

    expect(onAddModel).toHaveBeenCalledWith("gemini");
    expect(onRefreshModelConfig).toHaveBeenCalledWith("gemini");
    expect(screen.getByTestId("model-refreshing").textContent).toBe("yes");
  });

  it("keeps secondary tools collapsed until the tool dock is opened", () => {
    const { container } = render(
      <ButtonArea
        currentProvider="claude"
        models={[]}
        selectedModel=""
        hasInputContent
        onSubmit={vi.fn()}
        onProviderSelect={vi.fn()}
        onReasoningChange={vi.fn()}
        shortcutActions={[]}
      />,
    );

    const toggle = screen.getByRole("button", { name: "Expand or collapse input tools" });

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.querySelector(".selector-tool-icon.codicon-extensions")).toBeTruthy();
    expect(container.querySelector(".selector-tool-dock-toggle")?.textContent).not.toContain("工具");
    expect(screen.queryByTestId("config-select")).toBeNull();
    expect(screen.queryByTestId("provider-select")).toBeNull();
    expect(screen.getByTestId("reasoning-select")).toBeTruthy();
    expect(screen.getByTestId("model-select")).toBeTruthy();

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("config-select")).toBeTruthy();
    expect(screen.getByTestId("provider-select")).toBeTruthy();
  });

  it("renders the status panel toggle inside the opened tool dock", () => {
    const onToggleStatusPanel = vi.fn();

    render(
      <ButtonArea
        currentProvider="claude"
        models={[]}
        selectedModel=""
        hasInputContent
        onSubmit={vi.fn()}
        shortcutActions={[]}
        panelToggleSurface={(
          <button
            type="button"
            className="selector-button button-area-status-panel-toggle"
            onClick={onToggleStatusPanel}
            aria-label="Collapse status panel"
          >
            <span className="codicon codicon-layers" />
          </button>
        )}
      />,
    );

    expect(screen.queryByRole("button", { name: "Collapse status panel" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand or collapse input tools" }));
    screen.getByRole("button", { name: "Collapse status panel" }).click();

    expect(onToggleStatusPanel).toHaveBeenCalledTimes(1);
  });

  it("closes the tool dock on outside click and Escape", () => {
    render(
      <ButtonArea
        currentProvider="claude"
        models={[]}
        selectedModel=""
        hasInputContent
        onSubmit={vi.fn()}
        onProviderSelect={vi.fn()}
        onReasoningChange={vi.fn()}
        shortcutActions={[]}
      />,
    );

    const toggle = screen.getByRole("button", { name: "Expand or collapse input tools" });

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.mouseDown(document.body);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("places context before model and token surface after reasoning", () => {
    render(
      <ButtonArea
        currentProvider="claude"
        models={[]}
        selectedModel=""
        hasInputContent
        onSubmit={vi.fn()}
        onReasoningChange={vi.fn()}
        shortcutActions={[]}
        mainSurface={<span data-testid="main-surface">token</span>}
        contextSurface={<span data-testid="context-surface">ctx</span>}
      />,
    );

    const mainSurface = screen.getByTestId("main-surface");
    const modelSelect = screen.getByTestId("model-select");
    const reasoningSelect = screen.getByTestId("reasoning-select");
    const contextSurface = screen.getByTestId("context-surface");

    expect(contextSurface.compareDocumentPosition(modelSelect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(reasoningSelect.compareDocumentPosition(mainSurface) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

});
