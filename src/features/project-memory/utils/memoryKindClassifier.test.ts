import { describe, expect, it } from "vitest";
import { classifyMemoryImportance, classifyMemoryKind } from "./memoryKindClassifier";

describe("classifyMemoryKind", () => {
  it("classifies known issues from english signals", () => {
    expect(classifyMemoryKind("The API returned error 500 with stack trace")).toBe("known_issue");
  });

  it("classifies known issues from chinese signals", () => {
    expect(classifyMemoryKind("接口报错了，出现空指针异常堆栈")).toBe("known_issue");
  });

  it("suppresses known_issue by negation", () => {
    expect(classifyMemoryKind("There was no error after retry")).toBe("note");
  });

  it("classifies code decisions", () => {
    expect(classifyMemoryKind("Architecture decision and tradeoff discussion for migration")).toBe(
      "code_decision",
    );
  });

  it("classifies project context", () => {
    expect(classifyMemoryKind("Project setup and tech stack for this repository")).toBe(
      "project_context",
    );
  });

  it("uses priority when scores tie", () => {
    expect(classifyMemoryKind("bug report with architecture decision tradeoff discussion")).toBe(
      "known_issue",
    );
  });
});

describe("classifyMemoryImportance", () => {
  it("returns high for critical keywords", () => {
    expect(classifyMemoryImportance("critical production issue")).toBe("high");
  });

  it("returns medium for long content", () => {
    expect(classifyMemoryImportance("a".repeat(240))).toBe("medium");
  });

  it("returns low for short normal content", () => {
    expect(classifyMemoryImportance("short note")).toBe("low");
  });
});
