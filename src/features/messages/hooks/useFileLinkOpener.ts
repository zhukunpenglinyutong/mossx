import { useCallback, useState } from "react";
import type { MouseEvent } from "react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { openWorkspaceIn } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import type { OpenAppTarget } from "../../../types";
import {
  clampRendererContextMenuPosition,
  type RendererContextMenuItem,
  type RendererContextMenuState,
} from "../../../components/ui/RendererContextMenu";

type OpenTarget = {
  id: string;
  label: string;
  appName?: string | null;
  kind: OpenAppTarget["kind"];
  command?: string | null;
  args: string[];
};

const DEFAULT_OPEN_TARGET: OpenTarget = {
  id: "vscode",
  label: "VS Code",
  appName: "Visual Studio Code",
  kind: "app",
  command: null,
  args: [],
};

function resolveFilePath(path: string, workspacePath?: string | null) {
  const trimmed = path.trim();
  if (!workspacePath) {
    return trimmed;
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("~/")) {
    return trimmed;
  }
  const base = workspacePath.replace(/\/+$/, "");
  return `${base}/${trimmed}`;
}

function stripLineSuffix(path: string) {
  const withoutHashLine = path.replace(/#L?\d+(?:C\d+)?$/i, "");
  const match = withoutHashLine.match(/^(.*?)(?::\d+(?::\d+)?)?$/);
  return match ? (match[1] ?? withoutHashLine) : withoutHashLine;
}

function revealLabel() {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? navigator.platform ?? "";
  const normalized = platform.toLowerCase();
  if (normalized.includes("mac")) {
    return "Reveal in Finder";
  }
  if (normalized.includes("win")) {
    return "Show in Explorer";
  }
  return "Reveal in File Manager";
}

export function useFileLinkOpener(
  workspacePath: string | null,
  openTargets: OpenAppTarget[],
  selectedOpenAppId: string,
  onOpenWorkspaceFile?: ((path: string) => void) | null,
) {
  const [fileLinkMenu, setFileLinkMenu] =
    useState<RendererContextMenuState | null>(null);

  const closeFileLinkMenu = useCallback(() => {
    setFileLinkMenu(null);
  }, []);

  const reportOpenError = useCallback(
    (error: unknown, context: Record<string, string | null>) => {
      const message = error instanceof Error ? error.message : String(error);
      pushErrorToast({
        title: "Couldn’t open file",
        message,
      });
      console.warn("Failed to open file link", { message, ...context });
    },
    [],
  );

  const openFileLinkInConfiguredTarget = useCallback(
    async (rawPath: string) => {
      const target = {
        ...DEFAULT_OPEN_TARGET,
        ...(openTargets.find((entry) => entry.id === selectedOpenAppId) ??
          openTargets[0]),
      };
      const resolvedPath = resolveFilePath(stripLineSuffix(rawPath), workspacePath);

      try {
        if (target.kind === "finder") {
          await revealItemInDir(resolvedPath);
          return;
        }

        if (target.kind === "command") {
          if (!target.command) {
            return;
          }
          await openWorkspaceIn(resolvedPath, {
            command: target.command,
            args: target.args,
          });
          return;
        }

        const appName = (target.appName || target.label || "").trim();
        if (!appName) {
          return;
        }
        await openWorkspaceIn(resolvedPath, {
          appName,
          args: target.args,
        });
      } catch (error) {
        reportOpenError(error, {
          rawPath,
          resolvedPath,
          workspacePath,
          targetId: target.id,
          targetKind: target.kind,
          targetAppName: target.appName ?? null,
          targetCommand: target.command ?? null,
        });
      }
    },
    [openTargets, reportOpenError, selectedOpenAppId, workspacePath],
  );

  const openFileLink = useCallback(
    async (rawPath: string) => {
      const strippedPath = stripLineSuffix(rawPath).trim();
      const resolvedPath = resolveFilePath(strippedPath, workspacePath);
      const normalizedWorkspacePath = workspacePath
        ? workspacePath.replace(/\/+$/, "")
        : null;
      const editorRelativePath =
        strippedPath.startsWith("/") || strippedPath.startsWith("~/")
          ? normalizedWorkspacePath &&
            resolvedPath.startsWith(`${normalizedWorkspacePath}/`)
            ? resolvedPath.slice(normalizedWorkspacePath.length + 1)
            : null
          : strippedPath.startsWith("./")
            ? strippedPath.slice(2)
            : strippedPath.startsWith("../")
              ? null
              : strippedPath;
      if (onOpenWorkspaceFile && editorRelativePath) {
        onOpenWorkspaceFile(editorRelativePath);
        return;
      }
      try {
        await openPath(resolvedPath);
      } catch {
        await openFileLinkInConfiguredTarget(rawPath);
      }
    },
    [onOpenWorkspaceFile, openFileLinkInConfiguredTarget, workspacePath],
  );

  const showFileLinkMenu = useCallback(
    (event: MouseEvent, rawPath: string) => {
      event.preventDefault();
      event.stopPropagation();
      const target = {
        ...DEFAULT_OPEN_TARGET,
        ...(openTargets.find((entry) => entry.id === selectedOpenAppId) ??
          openTargets[0]),
      };
      const resolvedPath = resolveFilePath(stripLineSuffix(rawPath), workspacePath);
      const appName = (target.appName || target.label || "").trim();
      const items: RendererContextMenuItem[] = [
        {
          type: "item",
          id: "open-file",
          label: "Open File",
          onSelect: async () => {
            await openFileLink(rawPath);
          },
        },
        {
          type: "item",
          id: "open-configured-target",
          label:
            target.kind === "finder"
              ? revealLabel()
              : target.kind === "command"
                ? `Open in ${target.label}`
                : appName
                  ? `Open in ${appName}`
                  : "Open Link",
          onSelect: async () => {
            await openFileLinkInConfiguredTarget(rawPath);
          },
        },
        ...(target.kind === "finder"
          ? []
          : [
              {
                type: "item" as const,
                id: "reveal",
                label: revealLabel(),
                onSelect: async () => {
                  try {
                    await revealItemInDir(resolvedPath);
                  } catch (error) {
                    reportOpenError(error, {
                      rawPath,
                      resolvedPath,
                      workspacePath,
                      targetId: target.id,
                      targetKind: "finder",
                      targetAppName: null,
                      targetCommand: null,
                    });
                  }
                },
              },
            ]),
        {
          type: "item",
          id: "download-linked-file",
          label: "Download Linked File",
          disabled: true,
          onSelect: () => undefined,
        },
        {
          type: "item",
          id: "copy-link",
          label: "Copy Link",
          onSelect: async () => {
            const link =
              resolvedPath.startsWith("/") ? `file://${resolvedPath}` : resolvedPath;
            try {
              await navigator.clipboard.writeText(link);
            } catch {
              // Clipboard failures are non-fatal here.
            }
          },
        },
      ];

      const position = clampRendererContextMenuPosition(event.clientX, event.clientY, {
        width: 260,
        height: 260,
      });
      setFileLinkMenu({
        ...position,
        label: "File link actions",
        items,
      });
    },
    [
      openFileLink,
      openFileLinkInConfiguredTarget,
      openTargets,
      reportOpenError,
      selectedOpenAppId,
      workspacePath,
    ],
  );

  return { openFileLink, showFileLinkMenu, fileLinkMenu, closeFileLinkMenu };
}
