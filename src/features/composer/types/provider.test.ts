import { describe, expect, it } from "vitest";
import { isValidModelId, validateCodexCustomModels } from "./provider";

describe("composer/provider model id validation", () => {
  it("accepts model ids with square brackets", () => {
    expect(isValidModelId("[L]gemini-3-flash-preview")).toBe(true);
    expect(isValidModelId("Cxn[1m]")).toBe(true);
  });

  it("keeps bracketed custom models after runtime validation", () => {
    const models = validateCodexCustomModels([
      {
        id: "[L]gemini-3-flash-preview",
        label: "[L]gemini-3-flash-preview",
      },
      {
        id: "gemini-3-flash-preview",
        label: "gemini-3-flash-preview",
      },
    ]);
    expect(models).toHaveLength(2);
    expect(models[0]?.id).toBe("[L]gemini-3-flash-preview");
    expect(models[1]?.id).toBe("gemini-3-flash-preview");
  });
});
