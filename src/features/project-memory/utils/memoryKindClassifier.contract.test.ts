import { describe, expect, it } from "vitest";
import samples from "./memoryKindClassification.contract.json";
import { classifyMemoryKind } from "./memoryKindClassifier";

type ContractSample = {
  id: string;
  input: string;
  expectedKind: "known_issue" | "code_decision" | "project_context" | "note";
};

describe("memory kind classifier contract", () => {
  it("matches contract samples", () => {
    for (const sample of samples as ContractSample[]) {
      expect(classifyMemoryKind(sample.input), `sample ${sample.id}`).toBe(sample.expectedKind);
    }
  });
});
