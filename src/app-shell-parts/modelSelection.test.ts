import { describe, expect, it } from "vitest";
import type { EngineType, ModelOption } from "../types";
import {
  getEffectiveModels,
  getEffectiveSelectedEffort,
  getEffectiveReasoningSupported,
  getEffectiveSelectedModelId,
  getReasoningOptionsForModel,
  getNextEngineSelectedModelId,
} from "./modelSelection";

function createModel(
  id: string,
  overrides: Partial<ModelOption> = {},
): ModelOption {
  return {
    id,
    model: id,
    displayName: id,
    description: "",
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: false,
    ...overrides,
  };
}

describe("modelSelection", () => {
  const codexModels = [
    createModel("codex-default", { isDefault: true }),
    createModel("codex-alt"),
  ];
  const engineModels = [
    createModel("engine-default", { isDefault: true }),
    createModel("engine-alt"),
  ];

  it("uses codex models directly when codex is active", () => {
    expect(getEffectiveModels("codex", codexModels, engineModels)).toEqual(codexModels);
  });

  it("uses engine-provided models for non-codex engines", () => {
    expect(getEffectiveModels("claude", codexModels, engineModels)).toEqual(engineModels);
  });

  it("keeps the codex-selected model id when codex is active", () => {
    expect(
      getEffectiveSelectedModelId({
        activeEngine: "codex",
        selectedModelId: "codex-alt",
        activeThreadSelectedModelId: null,
        hasActiveThread: false,
        codexModels,
        engineModelsAsOptions: engineModels,
        engineSelectedModelIdByType: {},
        defaultClaudeModelId: "claude-fallback",
      }),
    ).toBe("codex-alt");
  });

  it("prefers the active codex thread model over the shared codex selection", () => {
    expect(
      getEffectiveSelectedModelId({
        activeEngine: "codex",
        selectedModelId: "codex-default",
        activeThreadSelectedModelId: "codex-alt",
        hasActiveThread: true,
        codexModels,
        engineModelsAsOptions: engineModels,
        engineSelectedModelIdByType: {},
        defaultClaudeModelId: "claude-fallback",
      }),
    ).toBe("codex-alt");
  });

  it("uses the active codex thread effort when the thread has its own composer selection", () => {
    expect(
      getEffectiveSelectedEffort({
        activeEngine: "codex",
        hasActiveThread: true,
        selectedEffort: "high",
        activeThreadSelection: {
          modelId: "codex-alt",
          effort: null,
        },
        reasoningOptions: ["medium", "high"],
      }),
    ).toBeNull();
  });

  it("falls back to the shared effort when the active codex thread has no composer selection", () => {
    expect(
      getEffectiveSelectedEffort({
        activeEngine: "codex",
        hasActiveThread: true,
        selectedEffort: "high",
        activeThreadSelection: null,
        reasoningOptions: ["medium", "high"],
      }),
    ).toBe("high");
  });

  it("derives reasoning options from supported efforts before falling back to the model default", () => {
    expect(
      getReasoningOptionsForModel(
        createModel("codex-alt", {
          supportedReasoningEfforts: [
            { reasoningEffort: "medium", description: "Medium" },
            { reasoningEffort: "high", description: "High" },
          ],
          defaultReasoningEffort: "low",
        }),
      ),
    ).toEqual(["medium", "high"]);
    expect(
      getReasoningOptionsForModel(
        createModel("codex-default", {
          supportedReasoningEfforts: [],
          defaultReasoningEffort: "medium",
        }),
      ),
    ).toEqual(["medium"]);
  });

  it("falls back to the configured claude default when no claude models are loaded yet", () => {
    expect(
      getEffectiveSelectedModelId({
        activeEngine: "claude",
        selectedModelId: "codex-alt",
        activeThreadSelectedModelId: null,
        hasActiveThread: false,
        codexModels,
        engineModelsAsOptions: [],
        engineSelectedModelIdByType: {},
        defaultClaudeModelId: "claude-fallback",
      }),
    ).toBe("claude-fallback");
  });

  it("prefers a valid non-codex engine selection over defaults", () => {
    const engineSelectedModelIdByType: Partial<Record<EngineType, string | null>> = {
      gemini: "engine-alt",
    };
    expect(
      getEffectiveSelectedModelId({
        activeEngine: "gemini",
        selectedModelId: "codex-alt",
        activeThreadSelectedModelId: null,
        hasActiveThread: false,
        codexModels,
        engineModelsAsOptions: engineModels,
        engineSelectedModelIdByType,
        defaultClaudeModelId: "claude-fallback",
      }),
    ).toBe("engine-alt");
  });

  it("falls back to the engine default when the saved non-codex selection is invalid", () => {
    const engineSelectedModelIdByType: Partial<Record<EngineType, string | null>> = {
      opencode: "missing-model",
    };
    expect(
      getEffectiveSelectedModelId({
        activeEngine: "opencode",
        selectedModelId: "codex-alt",
        activeThreadSelectedModelId: null,
        hasActiveThread: false,
        codexModels,
        engineModelsAsOptions: engineModels,
        engineSelectedModelIdByType,
        defaultClaudeModelId: "claude-fallback",
      }),
    ).toBe("engine-default");
  });

  it("prefers the active thread model over the global engine selection", () => {
    const engineSelectedModelIdByType: Partial<Record<EngineType, string | null>> = {
      claude: "engine-default",
    };
    expect(
      getEffectiveSelectedModelId({
        activeEngine: "claude",
        selectedModelId: "codex-alt",
        activeThreadSelectedModelId: "engine-alt",
        hasActiveThread: true,
        codexModels,
        engineModelsAsOptions: engineModels,
        engineSelectedModelIdByType,
        defaultClaudeModelId: "claude-fallback",
      }),
    ).toBe("engine-alt");
  });

  it("ignores the global engine selection for active threads without a stored model", () => {
    const engineSelectedModelIdByType: Partial<Record<EngineType, string | null>> = {
      claude: "engine-alt",
    };
    expect(
      getEffectiveSelectedModelId({
        activeEngine: "claude",
        selectedModelId: "codex-alt",
        activeThreadSelectedModelId: null,
        hasActiveThread: true,
        codexModels,
        engineModelsAsOptions: engineModels,
        engineSelectedModelIdByType,
        defaultClaudeModelId: "claude-fallback",
      }),
    ).toBe("engine-default");
  });

  it("falls back to the codex default when the thread model is invalid", () => {
    expect(
      getEffectiveSelectedModelId({
        activeEngine: "codex",
        selectedModelId: "missing-model",
        activeThreadSelectedModelId: "missing-thread-model",
        hasActiveThread: true,
        codexModels,
        engineModelsAsOptions: engineModels,
        engineSelectedModelIdByType: {},
        defaultClaudeModelId: "claude-fallback",
      }),
    ).toBe("codex-default");
  });

  it("accepts a stored codex thread model when the persisted value matches the model slug", () => {
    expect(
      getEffectiveSelectedModelId({
        activeEngine: "codex",
        selectedModelId: "codex-alt-model",
        activeThreadSelectedModelId: "codex-alt-model",
        hasActiveThread: true,
        codexModels: [
          createModel("codex-default", { model: "gpt-5.5", isDefault: true }),
          createModel("codex-alt", { model: "codex-alt-model" }),
        ],
        engineModelsAsOptions: engineModels,
        engineSelectedModelIdByType: {},
        defaultClaudeModelId: "claude-fallback",
      }),
    ).toBe("codex-alt");
  });

  it("falls back to the model default when the saved reasoning effort is unsupported", () => {
    expect(
      getEffectiveSelectedEffort({
        activeEngine: "codex",
        hasActiveThread: true,
        selectedEffort: "ultra",
        activeThreadSelection: {
          modelId: "codex-alt",
          effort: "ultra",
        },
        reasoningOptions: ["medium", "high"],
      }),
    ).toBe("medium");
  });

  it("keeps the saved non-codex engine selection when it is still valid", () => {
    expect(
      getNextEngineSelectedModelId({
        activeEngine: "claude",
        engineModelsAsOptions: engineModels,
        currentSelection: "engine-alt",
      }),
    ).toBeNull();
  });

  it("suggests the engine default when the saved non-codex selection is missing", () => {
    expect(
      getNextEngineSelectedModelId({
        activeEngine: "opencode",
        engineModelsAsOptions: engineModels,
        currentSelection: "missing-model",
      }),
    ).toBe("engine-default");
  });

  it("exposes reasoning support only for codex", () => {
    expect(getEffectiveReasoningSupported("codex", true)).toBe(true);
    expect(getEffectiveReasoningSupported("gemini", true)).toBe(false);
  });
});
