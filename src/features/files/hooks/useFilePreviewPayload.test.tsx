/** @vitest-environment jsdom */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileReadTarget } from "../../../utils/workspacePaths";
import { useFilePreviewPayload } from "./useFilePreviewPayload";
import { resolveFilePreviewHandle } from "../../../services/tauri";
import { resolveFileRenderProfile } from "../utils/fileRenderProfile";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
}));

vi.mock("../../../services/tauri", () => ({
  resolveFilePreviewHandle: vi.fn(),
}));

function makeWorkspaceTarget(path: string): FileReadTarget {
  return {
    domain: "workspace",
    normalizedInputPath: path,
    workspaceRelativePath: path,
  };
}

describe("useFilePreviewPayload", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps csv preview on inline bytes without requesting preview handles", async () => {
    const { result } = renderHook(() => useFilePreviewPayload({
      workspaceId: "ws-csv",
      customSpecRoot: null,
      fileReadTarget: makeWorkspaceTarget("docs/report.csv"),
      absolutePath: "/repo/docs/report.csv",
      renderProfile: resolveFileRenderProfile("docs/report.csv"),
      content: "name,value\nalpha,1",
      truncated: false,
      enabled: true,
    }));

    await waitFor(() => {
      expect(result.current.payload?.kind).toBe("inline-bytes");
    });
    expect(vi.mocked(resolveFilePreviewHandle)).not.toHaveBeenCalled();
  });

  it("downgrades legacy doc files to explicit fallback after resolving a preview handle", async () => {
    vi.mocked(resolveFilePreviewHandle).mockResolvedValue({
      absolutePath: "/repo/docs/legacy.doc",
      byteLength: 2048,
      extension: "doc",
    });

    const { result } = renderHook(() => useFilePreviewPayload({
      workspaceId: "ws-doc",
      customSpecRoot: null,
      fileReadTarget: makeWorkspaceTarget("docs/legacy.doc"),
      absolutePath: "/repo/docs/legacy.doc",
      renderProfile: resolveFileRenderProfile("docs/legacy.doc"),
      content: "",
      truncated: false,
      enabled: true,
    }));

    await waitFor(() => {
      expect(result.current.payload).toMatchObject({
        kind: "unsupported",
        reason: "legacy-doc",
      });
    });
  });

  it("does not let a stale handle request overwrite a newer preview target", async () => {
    let resolvePending: (value: {
      absolutePath: string;
      byteLength: number;
      extension: string | null;
    }) => void = () => {};
    vi.mocked(resolveFilePreviewHandle).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePending = resolve as typeof resolvePending;
        }),
    );

    const { result, rerender } = renderHook((props: {
      filePath: string;
      content: string;
    }) => useFilePreviewPayload({
      workspaceId: "ws-race",
      customSpecRoot: null,
      fileReadTarget: makeWorkspaceTarget(props.filePath),
      absolutePath: `/repo/${props.filePath}`,
      renderProfile: resolveFileRenderProfile(props.filePath),
      content: props.content,
      truncated: false,
      enabled: true,
    }), {
      initialProps: {
        filePath: "docs/report.pdf",
        content: "",
      },
    });

    rerender({
      filePath: "docs/report.csv",
      content: "name,value\nalpha,1",
    });

    resolvePending({
      absolutePath: "/repo/docs/report.pdf",
      byteLength: 4096,
      extension: "pdf",
    });

    await waitFor(() => {
      expect(result.current.payload?.kind).toBe("inline-bytes");
    });
    expect(result.current.payload).toMatchObject({
      kind: "inline-bytes",
      extension: "csv",
    });
  });

  it("fails closed when docx preview exceeds the bounded preview budget", async () => {
    vi.mocked(resolveFilePreviewHandle).mockResolvedValue({
      absolutePath: "/repo/docs/large.docx",
      byteLength: 3 * 1024 * 1024,
      extension: "docx",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useFilePreviewPayload({
      workspaceId: "ws-docx",
      customSpecRoot: null,
      fileReadTarget: makeWorkspaceTarget("docs/large.docx"),
      absolutePath: "/repo/docs/large.docx",
      renderProfile: resolveFileRenderProfile("docs/large.docx"),
      content: "",
      truncated: false,
      enabled: true,
    }));

    await waitFor(() => {
      expect(result.current.payload).toMatchObject({
        kind: "unsupported",
        reason: "budget-exceeded",
        extension: "docx",
      });
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
