import type { ThreadSummary } from "../../../types";
import type { WorkspaceSessionFolder } from "../../../services/tauri";

export type WorkspaceSessionThreadRow = {
  thread: ThreadSummary;
  depth: number;
};

export type WorkspaceSessionFolderNode = {
  folder: WorkspaceSessionFolder;
  children: WorkspaceSessionFolderNode[];
  rows: WorkspaceSessionThreadRow[];
};

export type WorkspaceSessionFolderProjection = {
  folders: WorkspaceSessionFolderNode[];
  rootRows: WorkspaceSessionThreadRow[];
  visibleSessionCount: number;
};

export type WorkspaceSessionFolderMoveTarget = {
  folderId: string | null;
  label: string;
};

function normalizeFolderId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function sortFolders(folders: WorkspaceSessionFolder[]) {
  return [...folders].sort((left, right) =>
    left.name.toLocaleLowerCase().localeCompare(right.name.toLocaleLowerCase()) ||
    left.createdAt - right.createdAt ||
    left.id.localeCompare(right.id),
  );
}

function hasReachableFolderCycle(
  folderId: string,
  parentById: ReadonlyMap<string, string | null>,
): boolean {
  const seen = new Set<string>();
  let currentId: string | null = folderId;

  while (currentId) {
    if (seen.has(currentId)) {
      return true;
    }
    seen.add(currentId);
    currentId = parentById.get(currentId) ?? null;
  }
  return false;
}

export function buildWorkspaceSessionFolderProjection(params: {
  folders: WorkspaceSessionFolder[];
  rows: WorkspaceSessionThreadRow[];
  folderIdBySessionId: ReadonlyMap<string, string>;
}): WorkspaceSessionFolderProjection {
  const nodeById = new Map<string, WorkspaceSessionFolderNode>();
  const rootFolders: WorkspaceSessionFolderNode[] = [];
  const parentById = new Map<string, string | null>();

  sortFolders(params.folders).forEach((folder) => {
    parentById.set(folder.id, normalizeFolderId(folder.parentId));
    nodeById.set(folder.id, {
      folder,
      children: [],
      rows: [],
    });
  });

  sortFolders(params.folders).forEach((folder) => {
    const node = nodeById.get(folder.id);
    if (!node) {
      return;
    }
    const parentId = normalizeFolderId(folder.parentId);
    const parent = parentId ? nodeById.get(parentId) : null;
    if (parent && parent.folder.id !== folder.id && !hasReachableFolderCycle(folder.id, parentById)) {
      parent.children.push(node);
      return;
    }
    rootFolders.push(node);
  });

  const rootRows: WorkspaceSessionThreadRow[] = [];
  params.rows.forEach((row) => {
    const folderId = normalizeFolderId(params.folderIdBySessionId.get(row.thread.id));
    const node = folderId ? nodeById.get(folderId) : null;
    if (!node) {
      rootRows.push(row);
      return;
    }
    node.rows.push(row);
  });

  return {
    folders: rootFolders,
    rootRows,
    visibleSessionCount: params.rows.length,
  };
}

export function buildWorkspaceSessionFolderMoveTargets(params: {
  folders: WorkspaceSessionFolder[];
  rootLabel: string;
}): WorkspaceSessionFolderMoveTarget[] {
  const sortedFolders = sortFolders(params.folders);
  const folderIds = new Set(sortedFolders.map((folder) => folder.id));
  const parentById = new Map(
    sortedFolders.map((folder) => [
      folder.id,
      normalizeFolderId(folder.parentId),
    ] as const),
  );
  const byParent = new Map<string | null, WorkspaceSessionFolder[]>();
  sortedFolders.forEach((folder) => {
    const parentId = normalizeFolderId(folder.parentId);
    const safeParentId =
      parentId &&
      parentId !== folder.id &&
      folderIds.has(parentId) &&
      !hasReachableFolderCycle(folder.id, parentById)
        ? parentId
        : null;
    const siblings = byParent.get(safeParentId) ?? [];
    siblings.push(folder);
    byParent.set(safeParentId, siblings);
  });

  const targets: WorkspaceSessionFolderMoveTarget[] = [
    { folderId: null, label: params.rootLabel },
  ];
  const visited = new Set<string>();
  const visit = (parentId: string | null, prefix: string) => {
    const children = byParent.get(parentId) ?? [];
    children.forEach((folder) => {
      if (visited.has(folder.id)) {
        return;
      }
      visited.add(folder.id);
      const label = prefix ? `${prefix} / ${folder.name}` : folder.name;
      targets.push({ folderId: folder.id, label });
      visit(folder.id, label);
    });
  };
  visit(null, "");
  return targets;
}
