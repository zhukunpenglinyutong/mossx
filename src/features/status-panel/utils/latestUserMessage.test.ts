import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import { resolveLatestUserMessagePreview } from "./latestUserMessage";

describe("resolveLatestUserMessagePreview", () => {
  it("returns empty state when there is no user message", () => {
    const preview = resolveLatestUserMessagePreview([
      { id: "a1", kind: "message", role: "assistant", text: "done" },
    ]);

    expect(preview).toEqual({
      text: "",
      imageCount: 0,
      hasMessage: false,
    });
  });

  it("returns the latest text-only user message", () => {
    const items: ConversationItem[] = [
      { id: "u1", kind: "message", role: "user", text: "older" },
      { id: "a1", kind: "message", role: "assistant", text: "done" },
      { id: "u2", kind: "message", role: "user", text: " latest question " },
    ];

    const preview = resolveLatestUserMessagePreview(items);

    expect(preview).toEqual({
      text: "latest question",
      imageCount: 0,
      hasMessage: true,
    });
  });

  it("returns image-only user message as meaningful preview", () => {
    const items: ConversationItem[] = [
      {
        id: "u1",
        kind: "message",
        role: "user",
        text: "   ",
        images: ["a.png", "b.png"],
      },
    ];

    const preview = resolveLatestUserMessagePreview(items);

    expect(preview).toEqual({
      text: "",
      imageCount: 2,
      hasMessage: true,
    });
  });

  it("keeps text and image count together for mixed messages", () => {
    const items: ConversationItem[] = [
      {
        id: "u1",
        kind: "message",
        role: "user",
        text: "Please check",
        images: ["a.png"],
      },
    ];

    const preview = resolveLatestUserMessagePreview(items);

    expect(preview).toEqual({
      text: "Please check",
      imageCount: 1,
      hasMessage: true,
    });
  });
});
