import { describe, expect, it } from "vitest";
import type { ProjectMemoryItem } from "../../../services/tauri";
import { isLikelyPollutedMemory } from "./memoryMarkers";

function makeMemory(partial: Partial<ProjectMemoryItem>): ProjectMemoryItem {
  return {
    id: "m-1",
    workspaceId: "ws-1",
    kind: "conversation",
    title: "title",
    summary: "summary",
    detail: null,
    rawText: null,
    cleanText: "clean",
    tags: [],
    importance: "medium",
    threadId: null,
    messageId: null,
    source: "auto",
    fingerprint: "fp",
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    workspaceName: null,
    workspacePath: null,
    engine: null,
    ...partial,
  };
}

describe("isLikelyPollutedMemory", () => {
  it("detects project-memory xml marker", () => {
    expect(
      isLikelyPollutedMemory(
        makeMemory({ summary: "<project-memory source='x'>payload</project-memory>" }),
      ),
    ).toBe(true);
  });

  it("detects memory summary prefix marker", () => {
    expect(
      isLikelyPollutedMemory(makeMemory({ detail: "【记忆上下文摘要】[对话记录] ..." })),
    ).toBe(true);
  });

  it("ignores normal notes", () => {
    expect(
      isLikelyPollutedMemory(makeMemory({ summary: "用户偏好：回答尽量简洁直接" })),
    ).toBe(false);
  });
});

