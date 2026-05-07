import { describe, expect, it } from "vitest";

import {
  buildWorkspaceSessionFolderMoveTargets,
  buildWorkspaceSessionFolderProjection,
} from "./workspaceSessionFolders";

describe("buildWorkspaceSessionFolderProjection", () => {
  it("organizes visible sessions without inflating membership count", () => {
    const projection = buildWorkspaceSessionFolderProjection({
      folders: [
        {
          id: "folder-b",
          workspaceId: "ws-1",
          parentId: "folder-a",
          name: "Child",
          createdAt: 2,
          updatedAt: 2,
        },
        {
          id: "folder-a",
          workspaceId: "ws-1",
          parentId: null,
          name: "Parent",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      rows: [
        { thread: { id: "root-session", name: "Root", updatedAt: 3 }, depth: 0 },
        { thread: { id: "folder-session", name: "Nested", updatedAt: 2 }, depth: 0 },
      ],
      folderIdBySessionId: new Map([["folder-session", "folder-b"]]),
    });

    expect(projection.visibleSessionCount).toBe(2);
    expect(projection.rootRows.map((row) => row.thread.id)).toEqual(["root-session"]);
    expect(projection.folders).toHaveLength(1);
    expect(projection.folders[0]?.children[0]?.rows.map((row) => row.thread.id)).toEqual([
      "folder-session",
    ]);
  });

  it("builds move targets only from the provided project folders", () => {
    const targets = buildWorkspaceSessionFolderMoveTargets({
      rootLabel: "Project root",
      folders: [
        {
          id: "folder-child",
          workspaceId: "ws-1",
          parentId: "folder-parent",
          name: "Claude fixes",
          createdAt: 2,
          updatedAt: 2,
        },
        {
          id: "folder-parent",
          workspaceId: "ws-1",
          parentId: null,
          name: "Planning",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    expect(targets).toEqual([
      { folderId: null, label: "Project root" },
      { folderId: "folder-parent", label: "Planning" },
      { folderId: "folder-child", label: "Planning / Claude fixes" },
    ]);
  });

  it("degrades corrupted folder parent cycles to root without recursive loops", () => {
    const cyclicFolders = [
      {
        id: "folder-a",
        workspaceId: "ws-1",
        parentId: "folder-b",
        name: "A",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "folder-b",
        workspaceId: "ws-1",
        parentId: "folder-a",
        name: "B",
        createdAt: 2,
        updatedAt: 2,
      },
    ];
    const projection = buildWorkspaceSessionFolderProjection({
      folders: cyclicFolders,
      rows: [{ thread: { id: "thread-a", name: "Thread", updatedAt: 3 }, depth: 0 }],
      folderIdBySessionId: new Map([["thread-a", "folder-a"]]),
    });

    expect(projection.folders.map((node) => node.folder.id)).toEqual(["folder-a", "folder-b"]);
    expect(projection.folders[0]?.rows.map((row) => row.thread.id)).toEqual(["thread-a"]);
    expect(
      buildWorkspaceSessionFolderMoveTargets({
        rootLabel: "Project root",
        folders: cyclicFolders,
      }),
    ).toEqual([
      { folderId: null, label: "Project root" },
      { folderId: "folder-a", label: "A" },
      { folderId: "folder-b", label: "B" },
    ]);
  });
});
