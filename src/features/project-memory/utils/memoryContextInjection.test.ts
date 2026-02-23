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
  return {
    memory: {
      id: extras?.memory?.id ?? "m-1",
      workspaceId: "ws-1",
      kind,
      title: extras?.memory?.title ?? summary,
      summary,
      detail: (extras?.memory as { detail?: string | null } | undefined)?.detail ?? null,
      cleanText: summary,
      tags: extras?.memory?.tags ?? [],
      importance: extras?.memory?.importance ?? "high",
      source: "auto",
      fingerprint: "fp",
      createdAt: extras?.memory?.createdAt ?? 1000,
      updatedAt: extras?.memory?.updatedAt ?? 1000,
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
    expect(selected[0].memory.id).toBe("c");
    expect(selected[1].memory.id).toBe("a");
    expect(selected[2].memory.id).toBe("b");
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

  it("supports summary mode for selected memory injection", () => {
    const memory = makeScored("note", "仅摘要内容", {
      memory: { id: "manual-2", detail: "这段 detail 不应被注入" } as any,
    }).memory;
    const result = injectSelectedMemoriesContext({
      userText: "hello",
      memories: [memory],
      mode: "summary",
    });
    expect(result.finalText).toContain("仅摘要内容");
    expect(result.finalText).not.toContain("这段 detail 不应被注入");
    expect(result.previewText).toContain("仅摘要内容");
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
