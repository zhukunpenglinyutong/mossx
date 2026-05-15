import { describe, expect, it } from "vitest";

import type { ConversationItem, ThreadSummary } from "../../../types";
import {
  mergeDegradedClaudeContinuitySummaries,
  mergeCodexCatalogSessionSummaries,
  selectRecoveredNewThreadSummary,
  selectReplacementThreadByMessageHistory,
} from "./useThreadActions.helpers";

describe("useThreadActions.helpers", () => {
  it("keeps quoted broken-pipe explanations in history matching", () => {
    const staleItems: ConversationItem[] = [
      {
        id: "user-1",
        kind: "message",
        role: "user",
        text: "继续",
      },
      {
        id: "assistant-1",
        kind: "message",
        role: "assistant",
        text: "Broken pipe (os error 32)\n\n结论先行：这是 stale session，需要重建 runtime。",
      },
    ];

    const candidateA: ThreadSummary = {
      id: "thread-a",
      name: "hi",
      updatedAt: 10,
      engineSource: "codex",
      threadKind: "native",
    };
    const candidateB: ThreadSummary = {
      id: "thread-b",
      name: "hi",
      updatedAt: 9,
      engineSource: "codex",
      threadKind: "native",
    };

    const matched = selectReplacementThreadByMessageHistory({
      staleItems,
      candidates: [
        {
          summary: candidateA,
          items: staleItems,
        },
        {
          summary: candidateB,
          items: [
            {
              id: "user-2",
              kind: "message",
              role: "user",
              text: "继续",
            },
          ],
        },
      ],
    });

    expect(matched?.id).toBe("thread-a");
  });

  it("selects the sole newly discovered replacement thread when generic summaries are ambiguous", () => {
    const staleSummary: ThreadSummary = {
      id: "thread-stale",
      name: "1",
      updatedAt: 100,
      engineSource: "codex",
      threadKind: "native",
    };
    const knownOlder: ThreadSummary = {
      id: "thread-known",
      name: "1",
      updatedAt: 90,
      engineSource: "codex",
      threadKind: "native",
    };
    const newlyRecovered: ThreadSummary = {
      id: "thread-recovered",
      name: "1",
      updatedAt: 101,
      engineSource: "codex",
      threadKind: "native",
    };

    const matched = selectRecoveredNewThreadSummary({
      staleThreadId: "thread-stale",
      staleSummary,
      previousSummaries: [staleSummary, knownOlder],
      summaries: [newlyRecovered, knownOlder, staleSummary],
    });

    expect(matched?.id).toBe("thread-recovered");
  });

  it("selects the sole strictly newer replacement thread when stale summary falls out of the current list", () => {
    const staleSummary: ThreadSummary = {
      id: "thread-stale",
      name: "",
      updatedAt: 100,
      engineSource: "codex",
      threadKind: "native",
    };
    const knownOlder: ThreadSummary = {
      id: "thread-known",
      name: "1",
      updatedAt: 90,
      engineSource: "codex",
      threadKind: "native",
    };
    const recovered: ThreadSummary = {
      id: "thread-recovered",
      name: "1",
      updatedAt: 105,
      engineSource: "codex",
      threadKind: "native",
    };

    const matched = selectRecoveredNewThreadSummary({
      staleThreadId: "thread-stale",
      staleSummary,
      previousSummaries: [knownOlder, recovered],
      summaries: [recovered, knownOlder],
    });

    expect(matched?.id).toBe("thread-recovered");
  });

  it("preserves real Claude subagent parent links from catalog sessions", () => {
    const merged = mergeCodexCatalogSessionSummaries(
      [
        {
          id: "claude:parent-session",
          name: "父会话",
          updatedAt: 100,
          engineSource: "claude",
          threadKind: "native",
        },
      ],
      [
        {
          sessionId: "claude:subagent:parent-session:a5e6403f261113239",
          title: "分析前端项目",
          updatedAt: 110,
          engine: "claude",
          parentSessionId: "claude:parent-session",
        },
      ],
      "workspace-1",
      {},
      () => undefined,
    );

    expect(
      merged.find((thread) => thread.id === "claude:subagent:parent-session:a5e6403f261113239")
        ?.parentThreadId,
    ).toBe("claude:parent-session");
  });

  it("normalizes bare Claude subagent parent links from catalog sessions", () => {
    const merged = mergeCodexCatalogSessionSummaries(
      [
        {
          id: "claude:parent-session",
          name: "父会话",
          updatedAt: 100,
          engineSource: "claude",
          threadKind: "native",
        },
      ],
      [
        {
          sessionId: "claude:subagent:parent-session:a5e6403f261113239",
          title: "分析前端项目",
          updatedAt: 110,
          engine: "claude",
          parentSessionId: "parent-session",
        },
      ],
      "workspace-1",
      {},
      () => undefined,
    );

    expect(
      merged.find((thread) => thread.id === "claude:subagent:parent-session:a5e6403f261113239")
        ?.parentThreadId,
    ).toBe("claude:parent-session");
  });

  it("does not let generic Claude catalog titles overwrite meaningful existing titles", () => {
    const merged = mergeCodexCatalogSessionSummaries(
      [
        {
          id: "claude:session-1",
          name: "稳定命名",
          updatedAt: 100,
          engineSource: "claude",
          threadKind: "native",
        },
      ],
      [
        {
          sessionId: "claude:session-1",
          title: "",
          updatedAt: 120,
          engine: "claude",
        },
      ],
      "workspace-1",
      {},
      () => undefined,
    );

    expect(merged.find((thread) => thread.id === "claude:session-1")?.name).toBe("稳定命名");
  });

  it("does not resurrect excluded Claude rows during degraded continuity", () => {
    const merged = mergeDegradedClaudeContinuitySummaries(
      [],
      [
        {
          id: "claude:hidden-native",
          name: "Hidden native",
          updatedAt: 120,
          engineSource: "claude",
          threadKind: "native",
        },
        {
          id: "claude:visible-native",
          name: "Visible native",
          updatedAt: 100,
          engineSource: "claude",
          threadKind: "native",
        },
      ],
      new Set(["claude:hidden-native"]),
    );

    expect(merged.map((thread) => thread.id)).toEqual(["claude:visible-native"]);
  });

});
