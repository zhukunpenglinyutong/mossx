import { describe, expect, it, vi } from "vitest";
import type { ProjectMemoryItem } from "../../../services/tauri";
import {
  buildMemoryBrief,
  buildMemoryScoutContextBlock,
  injectMemoryScoutBriefContext,
  scoutProjectMemory,
} from "./memoryScout";
import type { ProjectMemoryEmbeddingProvider } from "./projectMemorySemanticRetrieval";

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

function makeSemanticProvider(): ProjectMemoryEmbeddingProvider {
  return {
    providerId: "fake-local",
    modelId: "fake-semantic-v1",
    dimensions: 2,
    embeddingVersion: "test-v1",
    scope: "test",
    health: () => ({ status: "available" }),
    embed: (text: string) => {
      const normalized = text.toLowerCase();
      return normalized.includes("springboot-demo") || normalized.includes("之前分析过")
        ? [1, 0]
        : [0, 1];
    },
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
        query: null,
      }),
    );
  });

  it("recalls identity memories without requiring an exact query substring", async () => {
    const listFn = vi.fn().mockResolvedValue({
      items: [
        makeMemory({
          id: "identity",
          title: "身份信息",
          summary: "用户曾介绍自己的名字",
          cleanText: "我是陈湘宁你是谁你有什么能力",
          userInput: "我是陈湘宁你是谁你有什么能力",
          tags: ["identity"],
        }),
      ],
      total: 1,
    });

    const brief = await scoutProjectMemory({
      workspaceId: "ws-1",
      query: "我是谁",
      listFn,
    });

    expect(brief.status).toBe("ok");
    expect(brief.retrievalMode).toBe("lexical");
    expect(brief.semanticDiagnostics).toBeUndefined();
    expect(brief.items[0]?.memoryId).toBe("identity");
    expect(listFn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        query: null,
        pageSize: 200,
      }),
    );
  });

  it("continues fallback scanning across bounded pages", async () => {
    const fillerMemories = Array.from({ length: 200 }, (_, index) =>
      makeMemory({
        id: `filler-${index}`,
        title: `普通记录 ${index}`,
        summary: `普通记录 ${index}`,
        cleanText: `普通记录 ${index}`,
        importance: "high",
        updatedAt: 1000 - index,
      }),
    );
    const identityMemory = makeMemory({
      id: "identity-page-2",
      title: "身份信息",
      summary: "用户曾介绍自己的名字",
      cleanText: "我是陈湘宁你是谁你有什么能力",
      userInput: "我是陈湘宁你是谁你有什么能力",
      importance: "low",
      tags: ["identity"],
      updatedAt: 1,
    });
    const listFn = vi.fn().mockImplementation(({ page }: { page?: number | null }) =>
      Promise.resolve({
        items: page === 0 ? fillerMemories : [identityMemory],
        total: 201,
      }),
    );

    const brief = await scoutProjectMemory({
      workspaceId: "ws-1",
      query: "我是谁",
      listFn,
    });

    expect(brief.status).toBe("ok");
    expect(brief.items[0]?.memoryId).toBe("identity-page-2");
    expect(listFn).toHaveBeenCalledTimes(2);
    expect(listFn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        workspaceId: "ws-1",
        query: null,
        page: 1,
        pageSize: 200,
      }),
    );
  });

  it("uses semantic retrieval over broad local candidates when provider is available", async () => {
    const listFn = vi.fn().mockResolvedValue({
      items: [
        makeMemory({
          id: "semantic-hit",
          title: "项目历史分析",
          summary: "主要风险是部署配置",
          cleanText: "springboot-demo 使用 H2 database",
          tags: ["springboot-demo"],
        }),
      ],
      total: 1,
    });

    const brief = await scoutProjectMemory({
      workspaceId: "ws-1",
      query: "之前分析过 springboot-demo 吗",
      listFn,
      semanticProvider: makeSemanticProvider(),
      allowTestSemanticProvider: true,
    });

    expect(brief.status).toBe("ok");
    expect(brief.retrievalMode).toBe("hybrid");
    expect(brief.semanticDiagnostics).toMatchObject({
      status: "available",
      providerId: "fake-local",
      candidateCount: 1,
    });
    expect(brief.items[0]?.memoryId).toBe("semantic-hit");
    expect(listFn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        query: null,
        pageSize: 10000,
      }),
    );
  });

  it("falls back to lexical retrieval when semantic provider is unavailable", async () => {
    const listFn = vi.fn().mockResolvedValue({
      items: [makeMemory()],
      total: 1,
    });
    const unavailableProvider: ProjectMemoryEmbeddingProvider = {
      ...makeSemanticProvider(),
      health: () => ({ status: "unavailable", reason: "no_local_provider" }),
    };

    const brief = await scoutProjectMemory({
      workspaceId: "ws-1",
      query: "数据库 timeout",
      listFn,
      semanticProvider: unavailableProvider,
      allowTestSemanticProvider: true,
    });

    expect(brief.status).toBe("ok");
    expect(brief.retrievalMode).toBe("lexical");
    expect(brief.semanticDiagnostics).toMatchObject({
      status: "unavailable",
      fallbackReason: "no_local_provider",
    });
    expect(listFn).toHaveBeenCalledWith(
      expect.objectContaining({
        query: null,
        pageSize: 200,
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
    expect(injected.finalText).toContain('<project-memory-pack source="memory-scout"');
    expect(injected.finalText).toContain("Source Records:");
    expect(injected.finalText).toContain("</project-memory-pack>\n\n继续排查");
    expect(injected.finalText).not.toContain("vectorScore");
    expect(injected.finalText).not.toContain("embedding");
    expect(injected.injectedCount).toBe(1);
  });
});
