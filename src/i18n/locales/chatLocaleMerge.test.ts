import { describe, expect, it } from "vitest";
import en from "./en";
import zh from "./zh";

describe("chat locale merge", () => {
  it("keeps chat copy from all locale parts", () => {
    expect(zh.composer.queueStatusFuseReady).toBe("可融合到当前轮");
    expect(zh.chat.fuseFromQueue).toBe("融合");
    expect(en.composer.queueStatusFuseReady).toBe("Can fuse into current turn");
    expect(en.chat.fuseFromQueue).toBe("Fuse");
  });
});
