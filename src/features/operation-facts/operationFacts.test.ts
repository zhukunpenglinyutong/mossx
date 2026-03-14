import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../types";
import {
  extractCommandSummaries,
  extractFileChangeSummaries,
  summarizeFileChangeItem,
} from "./operationFacts";

function toolItem(
  id: string,
  overrides: Partial<Extract<ConversationItem, { kind: "tool" }>>,
): Extract<ConversationItem, { kind: "tool" }> {
  return {
    id,
    kind: "tool",
    toolType: "commandExecution",
    title: "Command: pnpm test",
    detail: "",
    ...overrides,
  };
}

describe("operationFacts", () => {
  it("extracts command summaries with stable status mapping", () => {
    const items: ConversationItem[] = [
      toolItem("cmd-1", {
        toolType: "commandExecution",
        title: "Command: pnpm lint",
        status: "completed",
        output: "ok",
      }),
      toolItem("cmd-2", {
        toolType: "commandExecution",
        title: "Command: pnpm test",
        status: "running",
      }),
    ];

    expect(extractCommandSummaries(items)).toEqual([
      { id: "cmd-1", command: "pnpm lint", status: "completed" },
      { id: "cmd-2", command: "pnpm test", status: "running" },
    ]);
  });

  it("extracts aggregated file change summaries and item-level event summary from the same facts", () => {
    const fileItem = toolItem("file-1", {
      toolType: "fileChange",
      title: "File changes",
      detail: "{}",
      status: "completed",
      changes: [
        { path: "src/App.tsx", kind: "modified", diff: "@@ -1 +1 @@\n-old\n+new" },
        { path: "src/App.tsx", kind: "modified", diff: "@@ -2 +2 @@\n-older\n+newer" },
        { path: "src/New.tsx", kind: "added", diff: "@@ -0,0 +1 @@\n+const x = 1;" },
      ],
    });

    expect(extractFileChangeSummaries([fileItem])).toEqual([
      {
        filePath: "src/App.tsx",
        fileName: "App.tsx",
        status: "M",
        additions: 2,
        deletions: 2,
      },
      {
        filePath: "src/New.tsx",
        fileName: "New.tsx",
        status: "A",
        additions: 1,
        deletions: 0,
      },
    ]);

    expect(summarizeFileChangeItem(fileItem)).toEqual({
      summary: "File change · App.tsx +2",
      filePath: "src/App.tsx",
      fileCount: 3,
      additions: 3,
      deletions: 2,
      statusLetter: "M",
    });
  });

  it("preserves delete status for file change event summaries", () => {
    const fileItem = toolItem("file-2", {
      toolType: "fileChange",
      title: "File changes",
      detail: "{}",
      status: "completed",
      changes: [
        { path: "src/Old.tsx", kind: "deleted", diff: "@@ -1 +0,0 @@\n-old" },
      ],
    });

    expect(summarizeFileChangeItem(fileItem)).toEqual({
      summary: "File change · Old.tsx",
      filePath: "src/Old.tsx",
      fileCount: 1,
      additions: 0,
      deletions: 1,
      statusLetter: "D",
    });
  });
});
