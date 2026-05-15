import { describe, expect, it } from "vitest";
import type { ProjectMemoryItem } from "../../../services/tauri";
import { cleanProjectMemoryRecordsForRequest } from "./projectMemoryCleaner";
import {
  buildProjectMemoryRetrievalPack,
  buildProjectMemorySourceRecords,
  formatProjectMemoryRetrievalPack,
  parseProjectMemoryRetrievalPackPrefix,
} from "./projectMemoryRetrievalPack";

function makeMemory(overrides: Partial<ProjectMemoryItem> = {}): ProjectMemoryItem {
  return {
    id: overrides.id ?? "memory-1",
    workspaceId: "ws-1",
    schemaVersion: 2,
    recordKind: overrides.recordKind ?? "conversation_turn",
    kind: overrides.kind ?? "conversation",
    title: overrides.title ?? "Spring Boot 项目上下文",
    summary: overrides.summary ?? "项目使用 Spring Boot 2.7 和 Java 11",
    detail: overrides.detail ?? null,
    cleanText: overrides.cleanText ?? "legacy clean text",
    tags: overrides.tags ?? ["spring"],
    importance: overrides.importance ?? "high",
    threadId: overrides.threadId ?? "thread-1",
    turnId: overrides.turnId ?? "turn-1",
    messageId: null,
    assistantMessageId: null,
    userInput: overrides.userInput ?? "用户问项目技术栈",
    assistantResponse: overrides.assistantResponse ?? "项目是 Spring Boot 2.7 + Java 11。",
    assistantThinkingSummary: overrides.assistantThinkingSummary ?? "识别项目技术栈",
    reviewState: null,
    source: overrides.source ?? "conversation_turn",
    fingerprint: "fp",
    createdAt: 1,
    updatedAt: overrides.updatedAt ?? 2,
    deletedAt: null,
    workspaceName: null,
    workspacePath: null,
    engine: overrides.engine ?? "codex",
    ...overrides,
  };
}

describe("buildProjectMemorySourceRecords", () => {
  it("builds detailed conversation turn records with stable indexes", () => {
    const records = buildProjectMemorySourceRecords({
      memories: [makeMemory({ id: "m-1" }), makeMemory({ id: "m-2", turnId: "turn-2" })],
    });

    expect(records.map((record) => record.index)).toEqual(["[M1]", "[M2]"]);
    expect(records[0]).toMatchObject({
      memoryId: "m-1",
      recordKind: "conversation_turn",
      threadId: "thread-1",
      turnId: "turn-1",
      engine: "codex",
      userInput: "用户问项目技术栈",
      assistantResponse: "项目是 Spring Boot 2.7 + Java 11。",
    });
  });

  it("continues indexes from a caller-provided start index", () => {
    const records = buildProjectMemorySourceRecords({
      memories: [makeMemory({ id: "m-2" })],
      startIndex: 2,
    });

    expect(records[0]?.index).toBe("[M2]");
  });

  it("falls back to detail for manual note records", () => {
    const records = buildProjectMemorySourceRecords({
      memories: [
        makeMemory({
          id: "manual-1",
          recordKind: "manual_note",
          source: "manual",
          kind: "note",
          userInput: null,
          assistantResponse: null,
          detail: "发布前必须先跑 typecheck。",
        }),
      ],
    });

    expect(records[0]?.detail).toBe("发布前必须先跑 typecheck。");
    expect(records[0]?.userInput).toBeNull();
  });

  it("marks field-level truncation without replacing detail with summary", () => {
    const records = buildProjectMemorySourceRecords({
      memories: [makeMemory({ assistantResponse: "A".repeat(120) })],
      fieldCharLimit: 40,
    });

    expect(records[0]?.assistantResponse).toContain("[truncated:assistantResponse]");
    expect(records[0]?.truncatedFields).toContain("assistantResponse");
    expect(records[0]?.summary).toContain("Spring Boot");
  });
});

describe("formatProjectMemoryRetrievalPack", () => {
  it("formats cleaner summary and source records", () => {
    const records = buildProjectMemorySourceRecords({ memories: [makeMemory({ id: "m-1" })] });
    const cleaner = cleanProjectMemoryRecordsForRequest({
      userText: "Spring Boot 技术栈是什么",
      records,
    });
    const pack = buildProjectMemoryRetrievalPack({
      source: "manual-selection",
      records,
      cleaner,
    });
    const text = formatProjectMemoryRetrievalPack(pack);

    expect(text).toContain('<project-memory-pack source="manual-selection"');
    expect(text).toContain("Cleaned Context:");
    expect(text).toContain("[M1]");
    expect(text).toContain("Original user input:");
    expect(text).toContain("Original assistant response:");
    expect(text).toContain("preserve its [Mx] citation");
  });

  it("marks pack truncation when total budget drops records", () => {
    const records = buildProjectMemorySourceRecords({
      memories: [
        makeMemory({ id: "m-1", assistantResponse: "A".repeat(100) }),
        makeMemory({ id: "m-2", assistantResponse: "B".repeat(100) }),
      ],
    });
    const pack = buildProjectMemoryRetrievalPack({
      source: "memory-scout",
      records,
      totalCharLimit: 260,
    });

    expect(pack.records).toHaveLength(1);
    expect(pack.truncated).toBe(true);
  });

  it("drops cleaner citations that refer to records removed by the pack budget", () => {
    const records = buildProjectMemorySourceRecords({
      memories: [
        makeMemory({ id: "m-1", title: "保留记录", assistantResponse: "Spring Boot 2.7" }),
        makeMemory({ id: "m-2", title: "被裁剪记录", assistantResponse: "React 19" }),
      ],
    });
    const pack = buildProjectMemoryRetrievalPack({
      source: "memory-scout",
      records,
      cleaner: {
        cleanedContextText: "- [M1] Spring Boot 2.7\n- [M2] React 19",
        relevantFacts: ["[M1] Spring Boot 2.7", "[M2] React 19"],
        irrelevantRecords: [],
        conflicts: ["[M1] conflicts with [M2]: 保留记录 / 被裁剪记录"],
        confidence: "high",
        status: "cleaned",
      },
      totalCharLimit: 260,
    });

    expect(pack.records.map((record) => record.index)).toEqual(["[M1]"]);
    expect(pack.cleaner?.relevantFacts).toEqual(["[M1] Spring Boot 2.7"]);
    expect(pack.cleaner?.conflicts).toEqual([]);
    expect(formatProjectMemoryRetrievalPack(pack)).not.toContain("[M2] React 19");
  });
});

describe("parseProjectMemoryRetrievalPackPrefix", () => {
  it("parses pack summary and strips user-visible text", () => {
    const records = buildProjectMemorySourceRecords({ memories: [makeMemory({ id: "m-1" })] });
    const pack = buildProjectMemoryRetrievalPack({ source: "memory-scout", records });
    const block = formatProjectMemoryRetrievalPack(pack);
    const parsed = parseProjectMemoryRetrievalPackPrefix(`${block}\n\n用户真实问题`);

    expect(parsed?.remainingText).toBe("用户真实问题");
    expect(parsed?.packSummary.records[0]).toMatchObject({
      index: "[M1]",
      memoryId: "m-1",
    });
    expect(parsed?.packSummary.cleanedContext).toContain("- source records only");
    expect(parsed?.packSummary.rawPayload).toContain("<project-memory-pack");
    expect(parsed?.packSummary.lines.join("\n")).toContain("[M1]");
  });
});

describe("cleanProjectMemoryRecordsForRequest", () => {
  it("classifies relevant and irrelevant records with citations", () => {
    const records = buildProjectMemorySourceRecords({
      memories: [
        makeMemory({ id: "m-1", title: "Spring Boot 技术栈" }),
        makeMemory({
          id: "m-2",
          title: "React 样式",
          summary: "CSS layout",
          userInput: null,
          assistantResponse: null,
          assistantThinkingSummary: null,
        }),
      ],
    });
    const result = cleanProjectMemoryRecordsForRequest({
      userText: "Spring Boot 用的什么版本",
      records,
    });

    expect(result.status).toBe("cleaned");
    expect(result.relevantFacts[0]).toContain("[M1] 项目是 Spring Boot 2.7 + Java 11。");
    expect(result.irrelevantRecords[0]?.index).toBe("[M2]");
    expect(result.cleanedContextText).toContain("[M1]");
  });

  it("surfaces polarity conflicts", () => {
    const records = buildProjectMemorySourceRecords({
      memories: [
        makeMemory({ id: "m-1", title: "开启 Memory Reference", summary: "enable memory" }),
        makeMemory({ id: "m-2", title: "关闭 Memory Reference", summary: "disable memory" }),
      ],
    });
    const result = cleanProjectMemoryRecordsForRequest({
      userText: "memory reference",
      records,
    });

    expect(result.conflicts[0]).toContain("[M1]");
    expect(result.conflicts[0]).toContain("[M2]");
  });
});
