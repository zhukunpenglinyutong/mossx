/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDetachedFileExplorerState } from "./useDetachedFileExplorerState";

type DetachedStateHookProps = {
  workspaceId: string;
  workspacePath: string;
  initialFilePath: string | null;
  sessionUpdatedAt: number;
};

type DetachedStateHookResult = ReturnType<typeof useDetachedFileExplorerState>;

describe("useDetachedFileExplorerState", () => {
  it("keeps independent state per hook instance", () => {
    const primary = renderHook(() =>
      useDetachedFileExplorerState("ws-1", "/repo", "src/main.ts"),
    );
    const secondary = renderHook(() =>
      useDetachedFileExplorerState("ws-1", "/repo", null),
    );

    act(() => {
      primary.result.current.openFile("README.md");
    });

    expect(primary.result.current.openTabs).toEqual(["src/main.ts", "README.md"]);
    expect(primary.result.current.activeFilePath).toBe("README.md");
    expect(secondary.result.current.openTabs).toEqual([]);
    expect(secondary.result.current.activeFilePath).toBeNull();
  });

  it("resets session state when the detached workspace retargets", () => {
    const { result, rerender } = renderHook<DetachedStateHookResult, DetachedStateHookProps>(
      ({ workspaceId, workspacePath, initialFilePath, sessionUpdatedAt }) =>
        useDetachedFileExplorerState(workspaceId, workspacePath, initialFilePath, sessionUpdatedAt),
      {
        initialProps: {
          workspaceId: "ws-1",
          workspacePath: "/repo",
          initialFilePath: "src/first.ts",
          sessionUpdatedAt: 1,
        } satisfies DetachedStateHookProps,
      },
    );

    act(() => {
      result.current.openFile("src/second.ts", { line: 8, column: 3 });
    });

    rerender({
      workspaceId: "ws-2",
      workspacePath: "/repo-2",
      initialFilePath: "docs/spec.md",
      sessionUpdatedAt: 2,
    });

    expect(result.current.openTabs).toEqual(["docs/spec.md"]);
    expect(result.current.activeFilePath).toBe("docs/spec.md");
    expect(result.current.navigationTarget).toBeNull();
  });

  it("keeps existing tabs when the same workspace retargets to another file", () => {
    const { result, rerender } = renderHook<DetachedStateHookResult, DetachedStateHookProps>(
      ({ workspaceId, workspacePath, initialFilePath, sessionUpdatedAt }) =>
        useDetachedFileExplorerState(workspaceId, workspacePath, initialFilePath, sessionUpdatedAt),
      {
        initialProps: {
          workspaceId: "ws-1",
          workspacePath: "/repo",
          initialFilePath: "src/first.ts",
          sessionUpdatedAt: 1,
        } satisfies DetachedStateHookProps,
      },
    );

    act(() => {
      result.current.openFile("src/second.ts");
    });

    rerender({
      workspaceId: "ws-1",
      workspacePath: "/repo",
      initialFilePath: "docs/spec.md",
      sessionUpdatedAt: 2,
    });

    expect(result.current.openTabs).toEqual([
      "src/first.ts",
      "src/second.ts",
      "docs/spec.md",
    ]);
    expect(result.current.activeFilePath).toBe("docs/spec.md");
  });

  it("clears pending navigation state when the same workspace restores another file", () => {
    const { result, rerender } = renderHook<DetachedStateHookResult, DetachedStateHookProps>(
      ({ workspaceId, workspacePath, initialFilePath, sessionUpdatedAt }) =>
        useDetachedFileExplorerState(workspaceId, workspacePath, initialFilePath, sessionUpdatedAt),
      {
        initialProps: {
          workspaceId: "ws-1",
          workspacePath: "/repo",
          initialFilePath: "README.md",
          sessionUpdatedAt: 1,
        } satisfies DetachedStateHookProps,
      },
    );

    act(() => {
      result.current.openFile("/repo/README.md", { line: 12, column: 4 });
    });

    expect(result.current.navigationTarget).toEqual({
      path: "README.md",
      line: 12,
      column: 4,
      requestId: 1,
    });

    rerender({
      workspaceId: "ws-1",
      workspacePath: "/repo",
      initialFilePath: "/repo/Dockerfile",
      sessionUpdatedAt: 2,
    });

    expect(result.current.openTabs).toEqual(["README.md", "Dockerfile"]);
    expect(result.current.activeFilePath).toBe("Dockerfile");
    expect(result.current.navigationTarget).toBeNull();
  });

  it("does not clear tabs when the same workspace is focused without a target file", () => {
    const { result, rerender } = renderHook<DetachedStateHookResult, DetachedStateHookProps>(
      ({ workspaceId, workspacePath, initialFilePath, sessionUpdatedAt }) =>
        useDetachedFileExplorerState(workspaceId, workspacePath, initialFilePath, sessionUpdatedAt),
      {
        initialProps: {
          workspaceId: "ws-1",
          workspacePath: "/repo",
          initialFilePath: "src/first.ts",
          sessionUpdatedAt: 1,
        } satisfies DetachedStateHookProps,
      },
    );

    act(() => {
      result.current.openFile("src/second.ts", { line: 6, column: 2 });
    });

    rerender({
      workspaceId: "ws-1",
      workspacePath: "/repo",
      initialFilePath: null,
      sessionUpdatedAt: 2,
    });

    expect(result.current.openTabs).toEqual(["src/first.ts", "src/second.ts"]);
    expect(result.current.activeFilePath).toBe("src/second.ts");
    expect(result.current.navigationTarget).toBeNull();
  });

  it("normalizes absolute workspace paths to the same relative tab key used by the main surface", () => {
    const { result, rerender } = renderHook<DetachedStateHookResult, DetachedStateHookProps>(
      ({ workspaceId, workspacePath, initialFilePath, sessionUpdatedAt }) =>
        useDetachedFileExplorerState(workspaceId, workspacePath, initialFilePath, sessionUpdatedAt),
      {
        initialProps: {
          workspaceId: "ws-1",
          workspacePath: "/repo",
          initialFilePath: "/repo/README.md",
          sessionUpdatedAt: 1,
        } satisfies DetachedStateHookProps,
      },
    );

    expect(result.current.openTabs).toEqual(["README.md"]);
    expect(result.current.activeFilePath).toBe("README.md");

    act(() => {
      result.current.openFile("/repo/docker-compose.yml");
    });

    expect(result.current.openTabs).toEqual(["README.md", "docker-compose.yml"]);
    expect(result.current.activeFilePath).toBe("docker-compose.yml");

    rerender({
      workspaceId: "ws-1",
      workspacePath: "/repo",
      initialFilePath: "/repo/.env.local",
      sessionUpdatedAt: 2,
    });

    expect(result.current.openTabs).toEqual([
      "README.md",
      "docker-compose.yml",
      ".env.local",
    ]);
    expect(result.current.activeFilePath).toBe(".env.local");
  });

  it("normalizes Windows-style workspace paths case-insensitively for detached parity", () => {
    const { result } = renderHook(() =>
      useDetachedFileExplorerState(
        "ws-win",
        "C:/Repo",
        "c:\\repo\\build.gradle.kts",
        1,
      ),
    );

    expect(result.current.openTabs).toEqual(["build.gradle.kts"]);
    expect(result.current.activeFilePath).toBe("build.gradle.kts");

    act(() => {
      result.current.openFile("C:\\Repo\\Dockerfile");
    });

    expect(result.current.openTabs).toEqual(["build.gradle.kts", "Dockerfile"]);
    expect(result.current.activeFilePath).toBe("Dockerfile");
  });
});
