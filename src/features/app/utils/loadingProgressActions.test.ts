import { afterEach, describe, expect, it, vi } from "vitest";
import { runWithLoadingProgress } from "./loadingProgressActions";

describe("runWithLoadingProgress", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading, returns action result, and hides loading", async () => {
    const controller = {
      showLoadingProgressDialog: vi.fn(() => "loading-1"),
      hideLoadingProgressDialog: vi.fn(),
    };

    await expect(
      runWithLoadingProgress(
        controller,
        { title: "Creating", message: "Please wait" },
        async () => "done",
      ),
    ).resolves.toBe("done");

    expect(controller.showLoadingProgressDialog).toHaveBeenCalledWith({
      title: "Creating",
      message: "Please wait",
    });
    expect(controller.hideLoadingProgressDialog).toHaveBeenCalledWith("loading-1");
  });

  it("hides loading when the action rejects", async () => {
    const controller = {
      showLoadingProgressDialog: vi.fn(() => "loading-2"),
      hideLoadingProgressDialog: vi.fn(),
    };
    const error = new Error("failed");

    await expect(
      runWithLoadingProgress(
        controller,
        { title: "Adding project" },
        async () => {
          throw error;
        },
      ),
    ).rejects.toBe(error);

    expect(controller.hideLoadingProgressDialog).toHaveBeenCalledWith("loading-2");
  });

  it("preserves the action error when cleanup also fails", async () => {
    const actionError = new Error("action failed");
    const cleanupError = new Error("cleanup failed");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const controller = {
      showLoadingProgressDialog: vi.fn(() => "loading-3"),
      hideLoadingProgressDialog: vi.fn(() => {
        throw cleanupError;
      }),
    };

    await expect(
      runWithLoadingProgress(
        controller,
        { title: "Creating" },
        async () => {
          throw actionError;
        },
      ),
    ).rejects.toBe(actionError);

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to hide loading progress dialog after action failure",
      cleanupError,
    );
  });

  it("surfaces cleanup failures when the action succeeds", async () => {
    const cleanupError = new Error("cleanup failed");
    const controller = {
      showLoadingProgressDialog: vi.fn(() => "loading-4"),
      hideLoadingProgressDialog: vi.fn(() => {
        throw cleanupError;
      }),
    };

    await expect(
      runWithLoadingProgress(
        controller,
        { title: "Creating" },
        async () => "done",
      ),
    ).rejects.toBe(cleanupError);
  });
});
