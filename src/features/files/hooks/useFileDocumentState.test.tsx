/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileReadTarget } from "../../../utils/workspacePaths";
import { useFileDocumentState } from "./useFileDocumentState";
import {
  readExternalAbsoluteFile,
  readExternalSpecFile,
  readWorkspaceFile,
  writeExternalSpecFile,
  writeWorkspaceFile,
} from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";

vi.mock("../../../services/tauri", () => ({
  readWorkspaceFile: vi.fn(),
  readExternalSpecFile: vi.fn(),
  readExternalAbsoluteFile: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  writeExternalSpecFile: vi.fn(),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

type HookProps = {
  workspaceId: string;
  customSpecRoot: string | null;
  workspaceRelativeFilePath: string;
  fileReadTarget: FileReadTarget;
  skipTextRead: boolean;
  externalAbsoluteReadOnlyMessage: string;
};

function makeWorkspaceTarget(path: string): FileReadTarget {
  return {
    domain: "workspace",
    normalizedInputPath: path,
    workspaceRelativePath: path,
  };
}

describe("useFileDocumentState", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("clears stale content when the target path becomes invalid", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "const value = 1;",
      truncated: false,
    });

    const { result, rerender } = renderHook(
      (props: HookProps) => useFileDocumentState(props),
      {
        initialProps: {
          workspaceId: "ws-invalid",
          customSpecRoot: null,
          workspaceRelativeFilePath: "src/value.ts",
          fileReadTarget: makeWorkspaceTarget("src/value.ts"),
          skipTextRead: false,
          externalAbsoluteReadOnlyMessage: "read only",
        },
      },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.content).toBe("const value = 1;");
    });

    rerender({
      workspaceId: "ws-invalid",
      customSpecRoot: null,
      workspaceRelativeFilePath: "",
      fileReadTarget: {
        domain: "invalid",
        normalizedInputPath: "",
        workspaceRelativePath: "",
      },
      skipTextRead: false,
      externalAbsoluteReadOnlyMessage: "read only",
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe("Invalid file path");
      expect(result.current.content).toBe("");
      expect(result.current.truncated).toBe(false);
    });
  });

  it("prevents duplicate save requests while the current save is still in flight", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "const value = 1;",
      truncated: false,
    });

    let resolveSave: (() => void) | null = null;
    vi.mocked(writeWorkspaceFile).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );

    const { result } = renderHook(
      (props: HookProps) => useFileDocumentState(props),
      {
        initialProps: {
          workspaceId: "ws-save",
          customSpecRoot: null,
          workspaceRelativeFilePath: "src/value.ts",
          fileReadTarget: makeWorkspaceTarget("src/value.ts"),
          skipTextRead: false,
          externalAbsoluteReadOnlyMessage: "read only",
        },
      },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.content).toBe("const value = 1;");
    });

    act(() => {
      result.current.setContent("const value = 2;");
    });
    await waitFor(() => {
      expect(result.current.isDirty).toBe(true);
    });
    expect(result.current.content).toBe("const value = 2;");
    expect(result.current.savedContentRef.current).toBe("const value = 1;");
    expect(result.current.isSaving).toBe(false);

    let firstSave!: Promise<boolean>;
    let secondSave!: Promise<boolean>;
    await act(async () => {
      firstSave = result.current.handleSave();
      await Promise.resolve();
    });

    expect(vi.mocked(writeWorkspaceFile)).toHaveBeenCalledTimes(1);

    await act(async () => {
      secondSave = result.current.handleSave();
      await Promise.resolve();
    });

    expect(vi.mocked(writeWorkspaceFile)).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave?.();
      await firstSave;
      await secondSave;
    });

    await expect(firstSave).resolves.toBe(true);
    await expect(secondSave).resolves.toBe(false);
    expect(vi.mocked(pushErrorToast)).not.toHaveBeenCalled();
    expect(vi.mocked(readExternalSpecFile)).not.toHaveBeenCalled();
    expect(vi.mocked(readExternalAbsoluteFile)).not.toHaveBeenCalled();
    expect(vi.mocked(writeExternalSpecFile)).not.toHaveBeenCalled();
  });
});
