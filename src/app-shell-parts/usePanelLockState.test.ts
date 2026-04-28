import { describe, expect, it, vi } from "vitest";
import { verifyPanelUnlockPassword } from "./usePanelLockState";

describe("verifyPanelUnlockPassword", () => {
  it("initializes the password file and unlocks when no password exists", async () => {
    const writeInitialPassword = vi.fn();

    await expect(
      verifyPanelUnlockPassword("", async () => null, writeInitialPassword),
    ).resolves.toBe(true);

    expect(writeInitialPassword).toHaveBeenCalledWith("000000");
  });

  it("accepts blank stored passwords to avoid locking users out", async () => {
    await expect(
      verifyPanelUnlockPassword("anything", async () => "   ", vi.fn()),
    ).resolves.toBe(true);
  });

  it("matches the trimmed stored password exactly", async () => {
    await expect(
      verifyPanelUnlockPassword("123456", async () => " 123456 ", vi.fn()),
    ).resolves.toBe(true);
    await expect(
      verifyPanelUnlockPassword("123", async () => " 123456 ", vi.fn()),
    ).resolves.toBe(false);
  });

  it("fails open when the password file cannot be read", async () => {
    await expect(
      verifyPanelUnlockPassword("wrong", async () => {
        throw new Error("read failed");
      }, vi.fn()),
    ).resolves.toBe(true);
  });
});
