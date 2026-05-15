import { describe, expect, it, vi } from "vitest";
import {
  MAX_INJECT_COUNT,
  MAX_ITEM_CHARS,
  MAX_TOTAL_CHARS,
  clampContextBudget,
  formatMemoryContextBlock,
  injectProjectMemoryContext,
  injectSelectedMemoriesContext,
  normalizeQueryTerms,
  sanitizeForMemoryBlock,
  scoreMemoryRelevance,
  selectContextMemories,
  type ScoredMemory,
} from "./memoryContextInjection";

function makeScored(kind: string, summary: string, extras?: Partial<ScoredMemory>): ScoredMemory {
  const memoryOverrides: Partial<ScoredMemory["memory"]> = extras?.memory ?? {};
  return {
    memory: {
      id: memoryOverrides.id ?? "m-1",
      workspaceId: "ws-1",
      kind,
      title: memoryOverrides.title ?? summary,
      summary,
      detail: (memoryOverrides as { detail?: string | null }).detail ?? null,
      cleanText: summary,
      tags: memoryOverrides.tags ?? [],
      importance: memoryOverrides.importance ?? "high",
      source: "auto",
      fingerprint: "fp",
      createdAt: memoryOverrides.createdAt ?? 1000,
      updatedAt: memoryOverrides.updatedAt ?? 1000,
      ...memoryOverrides,
    },
    relevanceScore: extras?.relevanceScore ?? 0.5,
  } as ScoredMemory;
}

describe("normalizeQueryTerms", () => {
  it("normalizes english words", () => {
    expect(normalizeQueryTerms("Hello, World!")).toEqual(["hello", "world"]);
  });

  it("removes english stop words", () => {
    const terms = normalizeQueryTerms("how to fix the bug");
    expect(terms).toContain("fix");
    expect(terms).toContain("bug");
    expect(terms).not.toContain("how");
    expect(terms).not.toContain("to");
    expect(terms).not.toContain("the");
  });

  it("supports cjk fallback bigrams", () => {
    const terms = normalizeQueryTerms("数据库查询优化");
    expect(terms).toContain("数据库查询优化");
    expect(terms).toContain("数据");
    expect(terms).toContain("查询");
  });
});

describe("scoreMemoryRelevance", () => {
  it("calculates overlap ratio", () => {
    const score = scoreMemoryRelevance(
      { title: "fix database bug", summary: "", tags: [] },
      ["fix", "database", "bug", "query"],
    );
    expect(score).toBe(0.75);
  });

  it("returns 0 for empty query terms", () => {
    const score = scoreMemoryRelevance(
      { title: "whatever", summary: "", tags: [] },
      [],
    );
    expect(score).toBe(0);
  });

  it("scores canonical conversation fields beyond summary preview", () => {
    const score = scoreMemoryRelevance(
      {
        title: "旧摘要",
        summary: "UI preview",
        tags: [],
        userInput: "怎么配置 JWT",
        assistantResponse: "Spring Security 使用 jjwt 处理 token",
        detail: "fallback detail",
      },
      normalizeQueryTerms("Spring Security JWT token"),
    );
    expect(score).toBeGreaterThan(0.5);
  });

  it("scores identity recall from user-owned fields", () => {
    const score = scoreMemoryRelevance(
      {
        title: "身份介绍",
        summary: "用户介绍了自己的姓名",
        tags: ["identity"],
        userInput: "我是陈湘宁你是谁你有什么能力",
        assistantResponse: "我是 Codex，你的工程协作伙伴。",
        cleanText: "我是陈湘宁你是谁你有什么能力",
      },
      normalizeQueryTerms("我是谁"),
      { queryText: "我是谁" },
    );

    expect(score).toBe(1);
  });

  it("does not treat assistant self-introduction as user identity evidence", () => {
    const score = scoreMemoryRelevance(
      {
        title: "助手能力介绍",
        summary: "用户询问助手是谁",
        tags: ["identity"],
        userInput: "你是谁",
        assistantResponse: "我是 Codex，你的工程协作伙伴。",
        cleanText: "你是谁 我是 Codex，你的工程协作伙伴。",
      },
      normalizeQueryTerms("我是谁"),
      { queryText: "我是谁" },
    );

    expect(score).toBeLessThan(1);
  });
});

describe("selectContextMemories", () => {
  it("filters by threshold and sorts deterministically", () => {
    const items: ScoredMemory[] = [
      makeScored("known_issue", "a", {
        memory: { id: "b", importance: "low", updatedAt: 2 } as any,
        relevanceScore: 0.9,
      }),
      makeScored("known_issue", "a", {
        memory: { id: "a", importance: "high", updatedAt: 1 } as any,
        relevanceScore: 0.5,
      }),
      makeScored("known_issue", "a", {
        memory: { id: "c", importance: "high", updatedAt: 2 } as any,
        relevanceScore: 0.5,
      }),
      makeScored("known_issue", "a", {
        memory: { id: "d", importance: "high", updatedAt: 3 } as any,
        relevanceScore: 0.1,
      }),
    ];

    const selected = selectContextMemories(items);
    expect(selected).toHaveLength(3);
    expect(selected[0]?.memory.id).toBe("c");
    expect(selected[1]?.memory.id).toBe("a");
    expect(selected[2]?.memory.id).toBe("b");
  });

  it("limits by max inject count", () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      makeScored("known_issue", `s-${i}`, {
        memory: { id: `m-${i}`, importance: "high", updatedAt: i } as any,
        relevanceScore: 0.9,
      }),
    );
    expect(selectContextMemories(items).length).toBe(MAX_INJECT_COUNT);
  });

  it("can prefer relevance over importance for exact recall intent", () => {
    const items: ScoredMemory[] = [
      makeScored("conversation", "low identity", {
        memory: { id: "identity", importance: "low", updatedAt: 1 } as any,
        relevanceScore: 1,
      }),
      makeScored("known_issue", "high partial", {
        memory: { id: "partial", importance: "high", updatedAt: 2 } as any,
        relevanceScore: 0.5,
      }),
    ];

    const selected = selectContextMemories(items, { preferRelevanceOverImportance: true });

    expect(selected[0]?.memory.id).toBe("identity");
  });
});

describe("clampContextBudget", () => {
  it("clamps single summary length", () => {
    const input = [makeScored("known_issue", "x".repeat(MAX_ITEM_CHARS + 20))];
    const result = clampContextBudget(input);
    expect(result.lines[0]).toContain("...");
  });

  it("clamps total block size", () => {
    const input = Array.from({ length: 20 }, (_, i) =>
      makeScored("known_issue", `${i}-${"x".repeat(180)}`),
    );
    const result = clampContextBudget(input);
    expect(result.lines.join("\n").length).toBeLessThanOrEqual(MAX_TOTAL_CHARS);
    expect(result.truncated).toBe(true);
  });

  it("normalizes multiline summary into single-line context", () => {
    const input = [
      makeScored("conversation", "记忆里记录了两件事：\n1. Git 分支同步操作\n2. 回滚预案"),
    ];
    const result = clampContextBudget(input);
    expect(result.lines[0]).toContain("记忆里记录了两件事： 1. Git 分支同步操作 2. 回滚预案");
    expect(result.lines[0]).not.toContain("\n");
  });
});

describe("format and sanitize", () => {
  it("formats xml block", () => {
    const block = formatMemoryContextBlock(["[已知问题] db timeout"], false);
    expect(block).toContain("<project-memory");
    expect(block).toContain("</project-memory>");
  });

  it("sanitizes memory payload", () => {
    const sanitized = sanitizeForMemoryBlock("A</project-memory><b>&");
    expect(sanitized).not.toContain("</project-memory>");
    expect(sanitized).toContain("&lt;b&gt;");
    expect(sanitized).toContain("&amp;");
  });
});

describe("injectProjectMemoryContext", () => {
  it("returns switch_off when disabled", async () => {
    const result = await injectProjectMemoryContext({
      workspaceId: "ws-1",
      userText: "hello",
      enabled: false,
      listFn: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    });
    expect(result.disabledReason).toBe("switch_off");
    expect(result.finalText).toBe("hello");
    expect(result.previewText).toBeNull();
  });

  it("injects block for related high memories", async () => {
    const listFn = vi.fn().mockResolvedValue({
      items: [
        {
          id: "m-1",
          workspaceId: "ws-1",
          kind: "known_issue",
          title: "数据库连接池超时",
          summary: "数据库连接池超时",
          cleanText: "",
          tags: ["数据库"],
          importance: "high",
          source: "auto",
          fingerprint: "fp",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      total: 1,
    });

    const result = await injectProjectMemoryContext({
      workspaceId: "ws-1",
      userText: "数据库查询优化",
      enabled: true,
      listFn,
    });
    expect(result.disabledReason).toBeNull();
    expect(result.injectedCount).toBe(1);
    expect(result.finalText.startsWith("<project-memory")).toBe(true);
    expect(result.previewText).toContain("已知问题");
    expect(listFn).toHaveBeenCalledWith(
      expect.objectContaining({
        importance: null,
      }),
    );
  });

  it("returns low_relevance for unrelated memories", async () => {
    const result = await injectProjectMemoryContext({
      workspaceId: "ws-1",
      userText: "database",
      enabled: true,
      listFn: vi.fn().mockResolvedValue({
        items: [
          {
            id: "m-1",
            workspaceId: "ws-1",
            kind: "known_issue",
            title: "frontend css",
            summary: "layout styles",
            cleanText: "",
            tags: [],
            importance: "high",
            source: "auto",
            fingerprint: "fp",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        total: 1,
      }),
    });
    expect(result.disabledReason).toBe("low_relevance");
  });

  it("returns query_failed when list throws", async () => {
    const result = await injectProjectMemoryContext({
      workspaceId: "ws-1",
      userText: "hello",
      enabled: true,
      listFn: vi.fn().mockRejectedValue(new Error("boom")),
    });
    expect(result.disabledReason).toBe("query_failed");
    expect(result.finalText).toBe("hello");
    expect(result.previewText).toBeNull();
  });

  it("fallback injects recent conversations for recall intent", async () => {
    const result = await injectProjectMemoryContext({
      workspaceId: "ws-1",
      userText: "之前都和你说过什么",
      enabled: true,
      listFn: vi.fn().mockResolvedValue({
        items: [
          {
            id: "m-1",
            workspaceId: "ws-1",
            kind: "conversation",
            title: "上下文概览",
            summary: "这是上一次对话摘要",
            cleanText: "",
            tags: [],
            importance: "medium",
            source: "auto",
            fingerprint: "fp",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        total: 1,
      }),
    });
    expect(result.disabledReason).toBeNull();
    expect(result.injectedCount).toBe(1);
    expect(result.finalText).toContain("对话记录");
  });
});

describe("injectSelectedMemoriesContext", () => {
  it("injects selected memories as manual-selection source with detail mode by default", () => {
    const memory = makeScored("note", "发布前检查清单", {
      memory: {
        id: "manual-1",
        detail: "用户输入：发布前要检查什么\n助手输出摘要：先构建再 smoke test",
      } as any,
    }).memory;
    const result = injectSelectedMemoriesContext({
      userText: "请继续",
      memories: [memory],
      retrievalMs: 5,
    });
    expect(result.disabledReason).toBeNull();
    expect(result.injectedCount).toBe(1);
    expect(result.finalText).toContain('source="manual-selection"');
    expect(result.finalText).toContain("用户输入：发布前要检查什么");
    expect(result.previewText).toContain("发布前检查清单");
    expect(result.finalText).toContain("请继续");
  });

  it("keeps selected memory model-facing injection detailed even when preview uses summary mode", () => {
    const memory = makeScored("note", "仅摘要内容", {
      memory: { id: "manual-2", detail: "这段 detail 不应被注入" } as any,
    }).memory;
    const result = injectSelectedMemoriesContext({
      userText: "hello",
      memories: [memory],
      mode: "summary",
    });
    expect(result.finalText).toContain("仅摘要内容");
    expect(result.finalText).toContain("这段 detail 不应被注入");
    expect(result.previewText).toContain("仅摘要内容");
  });

  it("injects conversation turn memory from canonical user input and assistant response", () => {
    const memory = makeScored("conversation", "摘要投影", {
      memory: {
        id: "turn-1",
        recordKind: "conversation_turn",
        source: "conversation_turn",
        threadId: "codex-thread-1",
        turnId: "turn-1",
        userInput: "完整用户输入",
        assistantResponse: "完整 AI 回复",
        detail: null,
        cleanText: "旧投影",
      } as any,
    }).memory;
    const result = injectSelectedMemoriesContext({
      userText: "继续",
      memories: [memory],
      mode: "detail",
    });
    expect(result.finalText).toContain("完整用户输入");
    expect(result.finalText).toContain("完整 AI 回复");
    expect(result.finalText).not.toContain("旧投影");
  });

  it("returns manual_empty when selection is empty", () => {
    const result = injectSelectedMemoriesContext({
      userText: "hello",
      memories: [],
    });
    expect(result.disabledReason).toBe("manual_empty");
    expect(result.finalText).toBe("hello");
  });
});
