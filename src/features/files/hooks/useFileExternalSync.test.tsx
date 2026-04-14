/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { useFileExternalSync } from "./useFileExternalSync";
import { readWorkspaceFile } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";

vi.mock("../../../services/tauri", () => ({
  readWorkspaceFile: vi.fn(),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useFileExternalSync", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("ignores stale polling refresh results after the file path changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T00:00:00Z"));
    const firstRead = createDeferred<{ content: string; truncated: boolean }>();
    vi.mocked(readWorkspaceFile)
      .mockImplementationOnce(() => firstRead.promise)
      .mockResolvedValue({ content: "fresh content", truncated: false });

    const { result, rerender } = renderHook(
      ({ filePath, workspaceRelativeFilePath }) => {
        const [content, setContent] = useState("initial content");
        const [truncated, setTruncated] = useState(false);
        const savedContentRef = useRef(content);
        const latestIsDirtyRef = useRef(false);
        const externalDiskSnapshotRef = useRef<{ content: string; truncated: boolean } | null>({
          content,
          truncated,
        });

        const sync = useFileExternalSync({
          filePath,
          workspaceId: "ws-sync",
          workspaceRelativeFilePath,
          fileReadTargetDomain: "workspace",
          externalChangeMonitoringEnabled: true,
          externalChangeTransportMode: "polling",
          externalChangePollIntervalMs: 20,
          isBinary: false,
          isLoading: false,
          caseInsensitivePathCompare: false,
          setContent: (value) => {
            savedContentRef.current = value;
            setContent(value);
          },
          setTruncated,
          savedContentRef,
          latestIsDirtyRef,
          externalDiskSnapshotRef,
          autoSyncedMessage: "auto synced",
        });

        return {
          ...sync,
          content,
          truncated,
        };
      },
      {
        initialProps: {
          filePath: "src/first.ts",
          workspaceRelativeFilePath: "src/first.ts",
        },
      },
    );

    await act(async () => {
      vi.advanceTimersByTime(25);
      await Promise.resolve();
    });

    rerender({
      filePath: "src/second.ts",
      workspaceRelativeFilePath: "src/second.ts",
    });

    await act(async () => {
      firstRead.resolve({ content: "stale first content", truncated: false });
      await Promise.resolve();
    });

    expect(result.current.content).toBe("initial content");

    await act(async () => {
      vi.advanceTimersByTime(25);
      await Promise.resolve();
    });

    expect(result.current.content).toBe("fresh content");
    expect(vi.mocked(pushErrorToast)).not.toHaveBeenCalled();
  });
});
