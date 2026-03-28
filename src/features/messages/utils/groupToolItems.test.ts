import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import { groupToolItems } from "./groupToolItems";

function createToolItem(
  id: string,
  title: string,
  toolType: Extract<ConversationItem, { kind: "tool" }>["toolType"] = "toolCall",
): Extract<ConversationItem, { kind: "tool" }> {
  return {
    id,
    kind: "tool",
    toolType,
    title,
    detail: "{}",
    status: "completed",
  };
}

describe("groupToolItems", () => {
  it("groups consecutive edit tools only", () => {
    const entries = groupToolItems([
      createToolItem("tool-1", "Tool: edit"),
      createToolItem("tool-2", "Tool: write_to_file"),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("editGroup");
  });

  it("does not treat TodoWrite as edit tool", () => {
    const entries = groupToolItems([
      createToolItem("tool-1", "Tool: edit"),
      createToolItem("tool-2", "Tool: TodoWrite"),
    ]);

    // TodoWrite is hidden by shouldHideToolItem, so only the edit item remains
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("item");
  });

  it("does not merge fileChange with edit group", () => {
    const entries = groupToolItems([
      createToolItem("tool-1", "Tool: edit"),
      createToolItem("tool-2", "File changes", "fileChange"),
      createToolItem("tool-3", "Tool: edit"),
    ]);

    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.kind === "item")).toBe(true);
  });

  it("hides TodoWrite tool blocks in message stream", () => {
    const entries = groupToolItems([
      createToolItem("tool-1", "Tool: read"),
      createToolItem("tool-2", "Tool: TodoWrite"),
      createToolItem("tool-3", "Tool: todo_write"),
      createToolItem("tool-4", "Tool: edit"),
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.kind).toBe("item");
    expect(entries[1]?.kind).toBe("item");
    if (entries[0]?.kind === "item" && entries[0].item.kind === "tool") {
      expect(entries[0].item.title).toBe("Tool: read");
    }
    if (entries[1]?.kind === "item" && entries[1].item.kind === "tool") {
      expect(entries[1].item.title).toBe("Tool: edit");
    }
  });

  it("keeps consecutive codex search_query mcp tools as individual items", () => {
    const entries = groupToolItems([
      createToolItem("tool-1", "Tool: search_query", "mcpToolCall"),
      createToolItem("tool-2", "Tool: search_query", "mcpToolCall"),
      createToolItem("tool-3", "Tool: search_query", "mcpToolCall"),
    ]);

    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.kind === "item")).toBe(true);
  });

  it("still groups regular grep-like search tools", () => {
    const entries = groupToolItems([
      createToolItem("tool-1", "Tool: grep"),
      createToolItem("tool-2", "Tool: grep"),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("searchGroup");
  });
});
