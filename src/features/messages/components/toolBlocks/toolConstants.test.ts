import { describe, expect, it } from "vitest";
import { getToolDisplayName, isBashTool, resolveToolStatus } from "./toolConstants";

describe("resolveToolStatus", () => {
  it("returns completed for explicit completion status even without output", () => {
    expect(resolveToolStatus("completed", false)).toBe("completed");
    expect(resolveToolStatus("success", false)).toBe("completed");
    expect(resolveToolStatus("done", false)).toBe("completed");
  });

  it("returns processing for in-progress status", () => {
    expect(resolveToolStatus("started", false)).toBe("processing");
    expect(resolveToolStatus("running", false)).toBe("processing");
    expect(resolveToolStatus("in_progress", false)).toBe("processing");
  });

  it("returns failed for error status", () => {
    expect(resolveToolStatus("failed", false)).toBe("failed");
    expect(resolveToolStatus("error", true)).toBe("failed");
  });

  it("falls back to output presence when status is unknown", () => {
    expect(resolveToolStatus("", true)).toBe("completed");
    expect(resolveToolStatus("unknown", false)).toBe("processing");
  });

  it("maps askuserquestion to ask user question display name", () => {
    expect(getToolDisplayName("askuserquestion")).toBe("询问用户问题");
  });

  it("treats exec_command and write_stdin as command tools", () => {
    expect(isBashTool("exec_command")).toBe(true);
    expect(isBashTool("write_stdin")).toBe(true);
  });
});
