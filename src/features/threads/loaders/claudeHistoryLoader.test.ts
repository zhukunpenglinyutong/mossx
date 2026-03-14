import { describe, expect, it } from "vitest";
import { parseClaudeHistoryMessages } from "./claudeHistoryLoader";

describe("parseClaudeHistoryMessages", () => {
  it("preserves transcript-style bash output and command metadata", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "tool",
        id: "tool-1",
        tool_name: "bash",
        tool_input: {
          command: "git log --oneline -10",
          description: "查看最近的 git 提交历史",
        },
      },
      {
        kind: "tool",
        id: "tool-1-result",
        toolType: "result",
        text: "",
        tool_output: {
          output: "abc123 first commit\ndef456 second commit\n",
          exit: 0,
        },
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "tool-1",
      kind: "tool",
      toolType: "bash",
      title: "bash",
      status: "completed",
      output: "abc123 first commit\ndef456 second commit\n",
    });
    if (items[0]?.kind === "tool") {
      expect(items[0].detail).toContain("git log --oneline -10");
      expect(items[0].detail).toContain("查看最近的 git 提交历史");
    }
  });

  it("preserves non-command tool input payload for read tools", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "tool",
        id: "tool-read-1",
        tool_name: "read_file",
        tool_input: {
          file_path: "/workspace/README.md",
        },
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "tool-read-1",
      kind: "tool",
      toolType: "read_file",
      title: "read_file",
    });
    if (items[0]?.kind === "tool") {
      expect(items[0].detail).toContain("file_path");
      expect(items[0].detail).toContain("/workspace/README.md");
    }
  });

  it("preserves full command tool_input payload so session activity can read cwd/argv", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "tool",
        id: "tool-bash-1",
        tool_name: "bash",
        tool_input: {
          argv: ["zsh", "-lc", "pnpm vitest"],
          cwd: "/workspace/project",
          description: "run tests",
        },
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "tool-bash-1",
      kind: "tool",
      toolType: "bash",
      title: "bash",
      status: "started",
    });
    if (items[0]?.kind === "tool") {
      expect(items[0].detail).toContain("argv");
      expect(items[0].detail).toContain("/workspace/project");
      expect(items[0].detail).toContain("run tests");
    }
  });
});
