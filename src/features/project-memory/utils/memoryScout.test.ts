import { describe, expect, it, vi } from "vitest";
import type { ProjectMemoryItem } from "../../../services/tauri";
import {
  buildMemoryBrief,
  buildMemoryScoutContextBlock,
  injectMemoryScoutBriefContext,
  scoutProjectMemory,
} from "./memoryScout";

function makeMemory(overrides: Partial<ProjectMemoryItem> = {}): ProjectMemoryItem {
  return {
    id: "m-1",
    workspaceId: "ws-1",
    recordKind: "conversation_turn",
    kind: "conversation",
    title: "数据库连接池配置",
    summary: "数据库连接池 timeout 需要按环境调优",
    detail: null,
    cleanText: "数据库连接池 timeout 需要按环境调优",
    tags: ["数据库", "timeout"],
    importance: "high",
    threadId: "thread-1",
    turnId: "turn-1",
    engine: "codex",
    source: "conversation_turn",
    fingerprint: "fp-1",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe("memoryScout", () => {
  it("builds an ok brief with source references and reasons", () => {
    const brief = buildMemoryBrief({
      query: "数据库 timeout 怎么排查",
      memories: [makeMemory()],
      elapsedMs: 7,
    });

    expect(brief.status).toBe("ok");
    expect(brief.items).toHaveLength(1);
    expect(brief.items[0]).toMatchObject({
      memoryId: "m-1",
      recordKind: "conversation_turn",
      source: {
        threadId: "thread-1",
        turnId: "turn-1",
        engine: "codex",
        updatedAt: 2,
      },
    });
    expect(brief.items[0]?.reason).toContain("Matched query terms");
  });

  it("returns empty when candidates do not match the query", () => {
    const brief = buildMemoryBrief({
      query: "前端动画",
      memories: [makeMemory()],
    });

    expect(brief.status).toBe("empty");
    expect(brief.items).toHaveLength(0);
  });

  it("excludes obsolete memory by default", () => {
    const brief = buildMemoryBrief({
      query: "数据库 timeout",
      memories: [
        makeMemory({
          id: "obsolete-1",
          metadata: { reviewState: "obsolete" },
        } as Partial<ProjectMemoryItem>),
      ],
    });

    expect(brief.status).toBe("empty");
  });

  it("marks truncated when selected memories exceed the item budget", () => {
    const memories = Array.from({ length: 5 }, (_, index) =>
      makeMemory({
        id: `m-${index}`,
        title: `数据库 timeout ${index}`,
        summary: `数据库 timeout ${index}`,
        updatedAt: index,
      }),
    );

    const brief = buildMemoryBrief({
      query: "数据库 timeout",
      memories,
    });

    expect(brief.status).toBe("ok");
    expect(brief.items).toHaveLength(3);
    expect(brief.truncated).toBe(true);
  });

  it("records potential conflicts without converting them into facts", () => {
    const brief = buildMemoryBrief({
      query: "功能开关",
      memories: [
        makeMemory({
          id: "enabled",
          title: "功能开关 enable",
          summary: "当前方案要求开启 feature flag",
        }),
        makeMemory({
          id: "disabled",
          title: "功能开关 disable",
          summary: "历史方案要求关闭 feature flag",
        }),
      ],
    });

    expect(brief.status).toBe("ok");
    expect(brief.conflicts[0]).toContain("Potential conflict");
  });

  it("queries only the provided workspace and does not call write APIs", async () => {
    const listFn = vi.fn().mockResolvedValue({
      items: [makeMemory()],
      total: 1,
    });

    const brief = await scoutProjectMemory({
      workspaceId: "ws-1",
      query: "数据库 timeout",
      listFn,
    });

    expect(brief.status).toBe("ok");
    expect(listFn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        query: "数据库 timeout",
      }),
    );
  });

  it("converts list errors into an error brief", async () => {
    const brief = await scoutProjectMemory({
      workspaceId: "ws-1",
      query: "数据库 timeout",
      listFn: vi.fn().mockRejectedValue(new Error("boom")),
    });

    expect(brief.status).toBe("error");
    expect(brief.items).toHaveLength(0);
  });

  it("formats memory-scout block and preserves user text separately", () => {
    const brief = buildMemoryBrief({
      query: "数据库 timeout",
      memories: [makeMemory()],
    });
    const block = buildMemoryScoutContextBlock(brief);
    const injected = injectMemoryScoutBriefContext({
      userText: "继续排查",
      brief,
    });

    expect(block).toContain('source="memory-scout"');
    expect(block).toContain("memoryId=m-1");
    expect(injected.finalText).toContain("</project-memory>\n\n继续排查");
    expect(injected.injectedCount).toBe(1);
  });
});
