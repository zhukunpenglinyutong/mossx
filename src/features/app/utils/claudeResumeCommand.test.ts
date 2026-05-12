import { describe, expect, it } from "vitest";
import {
  buildClaudeResumeCommand,
  buildClaudeResumeTerminalCommand,
  extractClaudeNativeSessionId,
} from "./claudeResumeCommand";

describe("claudeResumeCommand", () => {
  it("extracts native session ids only from finalized Claude thread ids", () => {
    expect(extractClaudeNativeSessionId("claude:session-1")).toBe("session-1");
    expect(extractClaudeNativeSessionId("claude:  session-1  ")).toBe("session-1");
    expect(extractClaudeNativeSessionId("claude-pending-1")).toBeNull();
    expect(extractClaudeNativeSessionId("codex:session-1")).toBeNull();
    expect(extractClaudeNativeSessionId("claude:")).toBeNull();
  });

  it("builds POSIX resume commands for paths with spaces", () => {
    expect(
      buildClaudeResumeCommand({
        workspacePath: "/Users/demo/My Project",
        sessionId: "abc-123",
        platform: "posix",
      }),
    ).toBe("cd '/Users/demo/My Project' && claude --resume 'abc-123'");
  });

  it("escapes POSIX apostrophes in workspace paths and session ids", () => {
    expect(
      buildClaudeResumeCommand({
        workspacePath: "/Users/demo/O'Brien Project",
        sessionId: "abc'123",
        platform: "posix",
      }),
    ).toBe("cd '/Users/demo/O'\\''Brien Project' && claude --resume 'abc'\\''123'");
  });

  it("builds Windows drive-aware resume commands", () => {
    expect(
      buildClaudeResumeCommand({
        workspacePath: "C:\\Users\\demo\\My Project",
        sessionId: "abc-123",
        platform: "windows",
      }),
    ).toBe('cd /d "C:\\Users\\demo\\My Project" && claude --resume "abc-123"');
  });

  it("rejects empty workspace paths or session ids", () => {
    expect(
      buildClaudeResumeCommand({
        workspacePath: "",
        sessionId: "abc-123",
        platform: "posix",
      }),
    ).toBeNull();
    expect(
      buildClaudeResumeCommand({
        workspacePath: "/Users/demo/project",
        sessionId: "",
        platform: "posix",
      }),
    ).toBeNull();
  });

  it("builds terminal resume commands without changing directory", () => {
    expect(buildClaudeResumeTerminalCommand("abc-123_efg.hij:klm")).toBe(
      "claude --resume abc-123_efg.hij:klm",
    );
    expect(buildClaudeResumeTerminalCommand("")).toBeNull();
    expect(buildClaudeResumeTerminalCommand("abc'123")).toBeNull();
  });
});
