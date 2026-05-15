import { describe, expect, it } from "vitest";
import type { ProjectMemoryItem } from "../../../services/tauri";
import {
  buildProjectMemoryEmbeddingContentHash,
  buildProjectMemoryEmbeddingDocument,
  buildProjectMemoryEmbeddingIndex,
  hybridRerankProjectMemories,
  isProjectMemoryEmbeddingRecordStale,
  retrieveProjectMemorySemanticCandidates,
  type ProjectMemoryEmbeddingProvider,
} from "./projectMemorySemanticRetrieval";

function makeMemory(overrides: Partial<ProjectMemoryItem> = {}): ProjectMemoryItem {
  return {
    id: overrides.id ?? "m-1",
    workspaceId: overrides.workspaceId ?? "ws-1",
    schemaVersion: 2,
    recordKind: overrides.recordKind ?? "conversation_turn",
    kind: overrides.kind ?? "conversation",
    title: overrides.title ?? "Spring Boot 项目风险",
    summary: overrides.summary ?? "摘要只说项目风险",
    detail: overrides.detail ?? "Detail: H2 database 只适合本地开发。",
    cleanText: overrides.cleanText ?? "clean text mentions deployment risk",
    tags: overrides.tags ?? ["springboot-demo", "risk"],
    importance: overrides.importance ?? "high",
    threadId: null,
    turnId: null,
    messageId: null,
    assistantMessageId: null,
    userInput: overrides.userInput ?? "之前分析过 springboot-demo 吗",
    assistantResponse: overrides.assistantResponse ?? "分析过，主要风险是 H2 database 配置。",
    assistantThinkingSummary: overrides.assistantThinkingSummary ?? "识别项目风险",
    reviewState: null,
    source: overrides.source ?? "conversation_turn",
    fingerprint: "fp-1",
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 2,
    deletedAt: overrides.deletedAt ?? null,
    workspaceName: null,
    workspacePath: null,
    engine: "codex",
    ...overrides,
  };
}

function makeProvider(): ProjectMemoryEmbeddingProvider {
  return {
    providerId: "fake-local",
    modelId: "fake-semantic-v1",
    dimensions: 3,
    embeddingVersion: "test-v1",
    scope: "test",
    health: () => ({ status: "available" }),
    embed: (text: string) => {
      const normalized = text.toLowerCase();
      if (normalized.includes("springboot-demo") || normalized.includes("之前分析过")) {
        return [1, 0, 0];
      }
      if (normalized.includes("h2 database")) {
        return [0, 1, 0];
      }
      return [0, 0, 1];
    },
  };
}

describe("projectMemorySemanticRetrieval", () => {
  it("builds deterministic embedding documents from detailed fields", () => {
    const documentText = buildProjectMemoryEmbeddingDocument(
      makeMemory({
        summary: "短摘要",
        userInput: "用户完整问题",
        assistantResponse: "助手完整回答",
        assistantThinkingSummary: "思考摘要",
      }),
    );

    expect(documentText).toContain("Title: Spring Boot 项目风险");
    expect(documentText).toContain("Tags: springboot-demo, risk");
    expect(documentText).toContain("Kind: conversation_turn");
    expect(documentText).toContain("User input: 用户完整问题");
    expect(documentText).toContain("Assistant thinking summary: 思考摘要");
    expect(documentText).toContain("Assistant response: 助手完整回答");
    expect(documentText).toContain("Detail: Detail: H2 database 只适合本地开发。");
    expect(documentText).toContain("Clean text: clean text mentions deployment risk");
  });

  it("does not treat test providers as production semantic capability", async () => {
    const result = await retrieveProjectMemorySemanticCandidates({
      workspaceId: "ws-1",
      query: "之前分析过 springboot-demo 吗",
      memories: [makeMemory()],
      provider: makeProvider(),
    });

    expect(result.status).toBe("unavailable");
    expect(result.diagnostics.fallbackReason).toBe("test_provider_not_allowed");
    expect(result.candidates).toHaveLength(0);
  });

  it("performs exact scan and returns semantic candidates when explicitly allowed", async () => {
    const result = await retrieveProjectMemorySemanticCandidates({
      workspaceId: "ws-1",
      query: "之前分析过 springboot-demo 吗",
      memories: [
        makeMemory({ id: "target", title: "项目风险记录" }),
        makeMemory({ id: "other", title: "完全无关", tags: ["css"], userInput: "动画怎么做" }),
      ],
      provider: makeProvider(),
      allowTestProvider: true,
      topK: 1,
    });

    expect(result.status).toBe("available");
    expect(result.candidates[0]?.memory.id).toBe("target");
    expect(result.candidates[0]?.retrievalMode).toBe("hybrid");
    expect(result.candidates[0]?.score.vectorScore).toBeGreaterThan(0.9);
    expect(result.diagnostics).toMatchObject({
      providerId: "fake-local",
      modelId: "fake-semantic-v1",
      scannedCount: 2,
      candidateCount: 1,
    });
  });

  it("keeps fuzzy golden queries inside top5 with deterministic fake vectors", async () => {
    const provider = makeProvider();
    const memories = [
      makeMemory({
        id: "springboot-demo",
        tags: ["springboot-demo"],
        userInput: "分析 springboot-demo",
        assistantResponse: "springboot-demo 已分析",
        detail: "",
        cleanText: "",
      }),
      makeMemory({
        id: "project-risk",
        title: "项目主要风险",
        tags: ["risk"],
        userInput: "项目风险",
        assistantResponse: "主要风险是部署配置",
        detail: "",
        cleanText: "",
      }),
      makeMemory({
        id: "jwt-config",
        title: "JWT 配置问题",
        tags: ["jwt"],
        userInput: "JWT 配置",
        assistantResponse: "JWT secret 需要配置",
        detail: "",
        cleanText: "",
      }),
      makeMemory({
        id: "memory-injection",
        title: "记忆注入方案",
        tags: ["memory"],
        userInput: "记忆注入",
        assistantResponse: "记忆注入只注入详情",
        detail: "",
        cleanText: "",
      }),
      makeMemory({
        id: "h2-risk",
        title: "H2 database 风险",
        tags: ["h2"],
        userInput: "H2 数据库",
        assistantResponse: "H2 database 只适合本地开发",
        detail: "",
        cleanText: "",
      }),
    ];
    const cases = [
      { query: "之前分析过 springboot-demo 吗", expected: "springboot-demo" },
      { query: "这个项目主要风险是什么", expected: "project-risk" },
      { query: "我之前说过 JWT 配置的问题吗", expected: "jwt-config" },
      { query: "上次关于记忆注入我们定了什么方案", expected: "memory-injection" },
      { query: "有没有提过 H2 数据库风险", expected: "h2-risk" },
    ];
    const goldenProvider: ProjectMemoryEmbeddingProvider = {
      ...provider,
      dimensions: 5,
      embed: (text: string) => {
        const normalized = text.toLowerCase();
        if (normalized.includes("springboot-demo")) {
          return [1, 0, 0, 0, 0];
        }
        if (normalized.includes("主要风险") || normalized.includes("项目主要风险")) {
          return [0, 1, 0, 0, 0];
        }
        if (normalized.includes("jwt")) {
          return [0, 0, 1, 0, 0];
        }
        if (normalized.includes("记忆注入")) {
          return [0, 0, 0, 1, 0];
        }
        if (normalized.includes("h2") || normalized.includes("数据库风险")) {
          return [0, 0, 0, 0, 1];
        }
        return [0.2, 0.2, 0.2, 0.2, 0.2];
      },
    };

    for (const item of cases) {
      const result = await retrieveProjectMemorySemanticCandidates({
        workspaceId: "ws-1",
        query: item.query,
        memories,
        provider: goldenProvider,
        allowTestProvider: true,
        topK: 5,
      });

      expect(result.candidates.map((candidate) => candidate.memory.id)).toContain(item.expected);
    }
  });

  it("detects stale records by content hash and provider metadata", async () => {
    const memory = makeMemory();
    const provider = makeProvider();
    const index = await buildProjectMemoryEmbeddingIndex({
      workspaceId: "ws-1",
      memories: [memory],
      provider,
      allowTestProvider: true,
      now: 10,
    });
    const record = index.records[0];

    expect(record).toBeDefined();
    expect(record?.contentHash).toBe(buildProjectMemoryEmbeddingContentHash(memory));
    expect(
      isProjectMemoryEmbeddingRecordStale({
        memory: { ...memory, assistantResponse: "内容已变化" },
        record: record!,
        provider,
      }),
    ).toBe(true);
    expect(
      isProjectMemoryEmbeddingRecordStale({
        memory,
        record: record!,
        provider: { ...provider, embeddingVersion: "test-v2" },
      }),
    ).toBe(true);
  });

  it("omits deleted memories from the local index lifecycle", async () => {
    const provider = makeProvider();
    const index = await buildProjectMemoryEmbeddingIndex({
      workspaceId: "ws-1",
      memories: [makeMemory({ id: "kept" }), makeMemory({ id: "deleted", deletedAt: 99 })],
      provider,
      allowTestProvider: true,
      now: 10,
    });

    expect(index.status).toBe("available");
    expect(index.records.map((record) => record.memoryId)).toEqual(["kept"]);
  });

  it("hybrid rerank keeps lexical candidates when semantic score is absent", () => {
    const lexical = makeMemory({
      id: "lexical",
      title: "JWT 配置",
      summary: "JWT secret 配置",
      tags: ["jwt"],
    });
    const semantic = makeMemory({
      id: "semantic",
      title: "历史安全方案",
      summary: "token 签名方案",
      tags: ["security"],
      assistantResponse: "",
      detail: "",
      cleanText: "",
    });

    const ranked = hybridRerankProjectMemories({
      memories: [lexical, semantic],
      query: "JWT 配置",
      semanticMatches: [{ memory: semantic, vectorScore: 0.95 }],
      topK: 2,
    });

    expect(ranked.map((entry) => entry.memory.id)).toEqual(["semantic", "lexical"]);
    expect(ranked[0]?.retrievalMode).toBe("semantic");
    expect(ranked[1]?.retrievalMode).toBe("lexical");
  });

  it("scans 10k local records with bounded diagnostics and no payload dumps", async () => {
    const provider = makeProvider();
    const memories = Array.from({ length: 10_000 }, (_, index) =>
      makeMemory({
        id: `memory-${index}`,
        title: index === 9_999 ? "springboot-demo target" : `普通记忆 ${index}`,
        tags: index === 9_999 ? ["springboot-demo"] : ["other"],
        userInput: index === 9_999 ? "之前分析过 springboot-demo 吗" : "普通问题",
        assistantResponse: index === 9_999 ? "分析过 springboot-demo。" : "普通回答",
        updatedAt: index + 1,
      }),
    );

    const result = await retrieveProjectMemorySemanticCandidates({
      workspaceId: "ws-1",
      query: "之前分析过 springboot-demo 吗",
      memories,
      provider,
      allowTestProvider: true,
      topK: 5,
    });

    expect(result.status).toBe("available");
    expect(result.diagnostics.scannedCount).toBe(10_000);
    expect(result.candidates.some((candidate) => candidate.memory.id === "memory-9999")).toBe(true);
    expect(JSON.stringify(result.diagnostics)).not.toContain("普通回答");
  });
});
