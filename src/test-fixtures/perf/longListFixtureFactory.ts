import type { ConversationItem } from "../../types";

const roles: Array<ConversationItem["kind"]> = ["message", "reasoning", "tool"];

export function buildLongListFixture(totalItems: number): ConversationItem[] {
  return Array.from({ length: totalItems }, (_, index): ConversationItem => {
    const kind = roles[index % roles.length];
    if (kind === "reasoning") {
      return {
        id: `reasoning-${index}`,
        kind: "reasoning",
        summary: `Reasoning summary ${index}`,
        content: `Synthetic reasoning content for item ${index}.`,
      };
    }
    if (kind === "tool") {
      return {
        id: `tool-${index}`,
        kind: "tool",
        toolType: "commandExecution",
        title: `Command ${index}`,
        detail: JSON.stringify({ command: "npm run typecheck", index }),
        status: index % 6 === 0 ? "running" : "completed",
        output: `synthetic output ${index}`,
      };
    }
    return {
      id: `message-${index}`,
      kind: "message",
      role: index % 2 === 0 ? "user" : "assistant",
      text: `Synthetic ${index % 2 === 0 ? "user" : "assistant"} message ${index}.`,
      isFinal: true,
    };
  });
}
