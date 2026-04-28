import { describe, expect, it } from "vitest";
import type { ThreadState } from "./useThreadsReducer";
import { initialState, threadReducer } from "./useThreadsReducer";

describe("threadReducer generated image placeholders", () => {
  it("replaces processing generated image card in place when the real image arrives", () => {
    const base: ThreadState = {
      ...initialState,
      itemsByThread: {
        "thread-1": [
          {
            id: "assistant-1",
            kind: "message",
            role: "assistant",
            text: "使用 imagegen skill，直接生成一张成年女性肖像。",
          },
          {
            id: "optimistic-generated-image:thread-1:assistant-1",
            kind: "generatedImage",
            status: "processing",
            sourceToolName: "image_generation_call",
            promptText: "直接生成一张成年女性肖像。",
            images: [],
          },
        ],
      },
    };

    const next = threadReducer(base, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "thread-1",
      item: {
        id: "generated-image-1",
        kind: "generatedImage",
        status: "completed",
        sourceToolName: "image_generation_end",
        promptText: "直接生成一张成年女性肖像。",
        images: [{ src: "data:image/png;base64,AAA" }],
      },
      hasCustomName: false,
    });

    expect(next.itemsByThread["thread-1"]).toEqual([
      {
        id: "assistant-1",
        kind: "message",
        role: "assistant",
        text: "使用 imagegen skill，直接生成一张成年女性肖像。",
      },
      {
        id: "generated-image-1",
        kind: "generatedImage",
        status: "completed",
        sourceToolName: "image_generation_end",
        promptText: "直接生成一张成年女性肖像。",
        images: [{ src: "data:image/png;base64,AAA" }],
      },
    ]);
  });

  it("preserves processing generated image card while processing snapshot has not caught up", () => {
    const base: ThreadState = {
      ...initialState,
      itemsByThread: {
        "thread-1": [
          {
            id: "assistant-1",
            kind: "message",
            role: "assistant",
            text: "使用 imagegen skill，直接生成一张成年女性肖像。",
          },
          {
            id: "optimistic-generated-image:thread-1:assistant-1",
            kind: "generatedImage",
            status: "processing",
            sourceToolName: "image_generation_call",
            promptText: "直接生成一张成年女性肖像。",
            images: [],
          },
        ],
      },
      threadStatusById: {
        "thread-1": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          isContextCompacting: false,
          processingStartedAt: Date.now(),
          lastDurationMs: null,
          heartbeatPulse: 1,
        },
      },
    };

    const next = threadReducer(base, {
      type: "setThreadItems",
      threadId: "thread-1",
      items: [
        {
          id: "assistant-1",
          kind: "message",
          role: "assistant",
          text: "使用 imagegen skill，直接生成一张成年女性肖像。",
        },
      ],
    });

    expect(next.itemsByThread["thread-1"]).toEqual([
      {
        id: "assistant-1",
        kind: "message",
        role: "assistant",
        text: "使用 imagegen skill，直接生成一张成年女性肖像。",
      },
      {
        id: "optimistic-generated-image:thread-1:assistant-1",
        kind: "generatedImage",
        status: "processing",
        sourceToolName: "image_generation_call",
        promptText: "直接生成一张成年女性肖像。",
        images: [],
      },
    ]);
  });

  it("replaces first-turn optimistic user bubble and retargets generated image placeholder", () => {
    const base: ThreadState = {
      ...initialState,
      itemsByThread: {
        "thread-1": [
          {
            id: "optimistic-user-1",
            kind: "message",
            role: "user",
            text: "生成一张美女图 亚洲,大胸,白富美",
          },
          {
            id: "optimistic-generated-image:thread-1:optimistic-user-1",
            kind: "generatedImage",
            status: "processing",
            sourceToolName: "image_generation_call",
            promptText: "生成一张美女图 亚洲,大胸,白富美",
            anchorUserMessageId: "optimistic-user-1",
            images: [],
          },
        ],
      },
      threadStatusById: {
        "thread-1": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          isContextCompacting: false,
          processingStartedAt: Date.now(),
          lastDurationMs: null,
          heartbeatPulse: 1,
        },
      },
    };

    const next = threadReducer(base, {
      type: "setThreadItems",
      threadId: "thread-1",
      items: [
        {
          id: "real-user-1",
          kind: "message",
          role: "user",
          text: "生成一张美女图 亚洲,大胸,白富美",
        },
      ],
    });

    expect(next.itemsByThread["thread-1"]).toEqual([
      {
        id: "real-user-1",
        kind: "message",
        role: "user",
        text: "生成一张美女图 亚洲,大胸,白富美",
      },
      {
        id: "optimistic-generated-image:thread-1:optimistic-user-1",
        kind: "generatedImage",
        status: "processing",
        sourceToolName: "image_generation_call",
        promptText: "生成一张美女图 亚洲,大胸,白富美",
        anchorUserMessageId: "real-user-1",
        images: [],
      },
    ]);
  });

  it("does not append a third user bubble when the real first-turn user arrives by upsert", () => {
    const base: ThreadState = {
      ...initialState,
      itemsByThread: {
        "thread-1": [
          {
            id: "optimistic-user-1",
            kind: "message",
            role: "user",
            text: "生成一张图, 要美女",
          },
          {
            id: "optimistic-generated-image:thread-1:optimistic-user-1",
            kind: "generatedImage",
            status: "processing",
            sourceToolName: "image_generation_call",
            promptText: "生成一张图, 要美女",
            anchorUserMessageId: "optimistic-user-1",
            images: [],
          },
        ],
      },
    };

    const next = threadReducer(base, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "thread-1",
      item: {
        id: "real-user-1",
        kind: "message",
        role: "user",
        text: "生成一张图, 要美女",
      },
      hasCustomName: false,
    });

    expect(next.itemsByThread["thread-1"]).toEqual([
      {
        id: "real-user-1",
        kind: "message",
        role: "user",
        text: "生成一张图, 要美女",
      },
      {
        id: "optimistic-generated-image:thread-1:optimistic-user-1",
        kind: "generatedImage",
        status: "processing",
        sourceToolName: "image_generation_call",
        promptText: "生成一张图, 要美女",
        anchorUserMessageId: "real-user-1",
        images: [],
      },
    ]);
  });

  it("clears unresolved processing generated image cards during terminal cleanup", () => {
    const base: ThreadState = {
      ...initialState,
      itemsByThread: {
        "thread-1": [
          {
            id: "optimistic-generated-image:thread-1:assistant-1",
            kind: "generatedImage",
            status: "processing",
            sourceToolName: "image_generation_call",
            promptText: "直接生成一张成年女性肖像。",
            images: [],
          },
          {
            id: "generated-image-1",
            kind: "generatedImage",
            status: "completed",
            sourceToolName: "image_generation_end",
            promptText: "直接生成一张成年女性肖像。",
            images: [{ src: "data:image/png;base64,AAA" }],
          },
        ],
      },
    };

    const next = threadReducer(base, {
      type: "clearProcessingGeneratedImages",
      threadId: "thread-1",
    });

    expect(next.itemsByThread["thread-1"]).toEqual([
      {
        id: "generated-image-1",
        kind: "generatedImage",
        status: "completed",
        sourceToolName: "image_generation_end",
        promptText: "直接生成一张成年女性肖像。",
        images: [{ src: "data:image/png;base64,AAA" }],
      },
    ]);
  });

  it("preserves a new processing card while older completed images remain in the thread", () => {
    const base: ThreadState = {
      ...initialState,
      itemsByThread: {
        "thread-1": [
          {
            id: "generated-image-old",
            kind: "generatedImage",
            status: "completed",
            sourceToolName: "image_generation_end",
            promptText: "旧风景图",
            anchorUserMessageId: "user-old",
            images: [{ src: "data:image/png;base64,OLD" }],
          },
          {
            id: "assistant-1",
            kind: "message",
            role: "assistant",
            text: "使用 imagegen skill，直接生成一张成年女性肖像。",
          },
          {
            id: "optimistic-generated-image:thread-1:assistant-1",
            kind: "generatedImage",
            status: "processing",
            sourceToolName: "image_generation_call",
            promptText: "直接生成一张成年女性肖像。",
            anchorUserMessageId: "user-new",
            images: [],
          },
        ],
      },
      threadStatusById: {
        "thread-1": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          isContextCompacting: false,
          processingStartedAt: Date.now(),
          lastDurationMs: null,
          heartbeatPulse: 1,
        },
      },
    };

    const next = threadReducer(base, {
      type: "setThreadItems",
      threadId: "thread-1",
      items: [
        {
          id: "generated-image-old",
          kind: "generatedImage",
          status: "completed",
          sourceToolName: "image_generation_end",
          promptText: "旧风景图",
          anchorUserMessageId: "user-old",
          images: [{ src: "data:image/png;base64,OLD" }],
        },
        {
          id: "assistant-1",
          kind: "message",
          role: "assistant",
          text: "使用 imagegen skill，直接生成一张成年女性肖像。",
        },
      ],
    });

    expect(next.itemsByThread["thread-1"]).toEqual([
      {
        id: "generated-image-old",
        kind: "generatedImage",
        status: "completed",
        sourceToolName: "image_generation_end",
        promptText: "旧风景图",
        anchorUserMessageId: "user-old",
        images: [{ src: "data:image/png;base64,OLD" }],
      },
      {
        id: "assistant-1",
        kind: "message",
        role: "assistant",
        text: "使用 imagegen skill，直接生成一张成年女性肖像。",
      },
      {
        id: "optimistic-generated-image:thread-1:assistant-1",
        kind: "generatedImage",
        status: "processing",
        sourceToolName: "image_generation_call",
        promptText: "直接生成一张成年女性肖像。",
        anchorUserMessageId: "user-new",
        images: [],
      },
    ]);
  });
});
