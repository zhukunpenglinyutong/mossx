import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  resolveFilePreviewHandle,
  type FilePreviewHandle,
} from "../../../services/tauri";
import type {
  FileRenderProfile,
  PreviewSourceKind,
} from "../utils/fileRenderProfile";
import type { FileReadTarget } from "../../../utils/workspacePaths";

export type FilePreviewPayload =
  | {
      kind: "asset-url";
      sourceKind: "asset-url";
      absolutePath: string;
      assetUrl: string;
      extension: string | null;
      byteLength: number | null;
    }
  | {
      kind: "inline-bytes";
      sourceKind: "inline-bytes";
      text: string;
      extension: string | null;
      byteLength: number;
      truncated: boolean;
    }
  | {
      kind: "file-handle";
      sourceKind: "file-handle" | "extracted-structure";
      absolutePath: string;
      assetUrl: string;
      extension: string | null;
      byteLength: number;
    }
  | {
      kind: "extracted-structure";
      sourceKind: "extracted-structure";
      absolutePath: string;
      assetUrl: string;
      extension: string | null;
      byteLength: number;
      html: string;
      warnings: string[];
    }
  | {
      kind: "unsupported";
      sourceKind: PreviewSourceKind | null;
      reason:
        | "invalid-path"
        | "missing-handle"
        | "legacy-doc"
        | "load-failed"
        | "budget-exceeded";
      detail?: string | null;
      absolutePath?: string | null;
      extension?: string | null;
      byteLength?: number | null;
      budgetMegabytes?: number | null;
    };

type UseFilePreviewPayloadArgs = {
  workspaceId: string;
  customSpecRoot: string | null;
  fileReadTarget: FileReadTarget;
  absolutePath: string;
  renderProfile: FileRenderProfile;
  content: string;
  truncated: boolean;
  enabled: boolean;
};

type PreviewState = {
  payload: FilePreviewPayload | null;
  isLoading: boolean;
  error: string | null;
};

const MAX_DOCUMENT_PREVIEW_BYTES = 2 * 1024 * 1024;
const MAX_DOCUMENT_PREVIEW_MB = 2;

function asPreviewHandlePayload(
  handle: FilePreviewHandle,
  sourceKind: "file-handle" | "extracted-structure",
) {
  return {
    kind: "file-handle" as const,
    sourceKind,
    absolutePath: handle.absolutePath,
    assetUrl: convertFileSrc(handle.absolutePath),
    extension: handle.extension,
    byteLength: handle.byteLength,
  };
}

function resolvePreviewHandleRequest(
  fileReadTargetDomain: FileReadTarget["domain"],
  workspaceRelativePath: string,
  normalizedInputPath: string,
  externalSpecLogicalPath: string | null,
  customSpecRoot: string | null,
) {
  if (fileReadTargetDomain === "workspace") {
    return {
      domain: "workspace" as const,
      path: workspaceRelativePath,
      specRoot: null,
    };
  }
  if (fileReadTargetDomain === "external-spec" && customSpecRoot && externalSpecLogicalPath) {
    return {
      domain: "external-spec" as const,
      path: externalSpecLogicalPath,
      specRoot: customSpecRoot,
    };
  }
  if (fileReadTargetDomain === "external-absolute") {
    return {
      domain: "external-absolute" as const,
      path: normalizedInputPath,
      specRoot: null,
    };
  }
  return null;
}

export function useFilePreviewPayload({
  workspaceId,
  customSpecRoot,
  fileReadTarget,
  absolutePath,
  renderProfile,
  content,
  truncated,
  enabled,
}: UseFilePreviewPayloadArgs): PreviewState {
  const requestIdRef = useRef(0);
  const fileReadTargetDomain = fileReadTarget.domain;
  const workspaceRelativePath = fileReadTarget.workspaceRelativePath;
  const normalizedInputPath = fileReadTarget.normalizedInputPath;
  const externalSpecLogicalPath =
    fileReadTargetDomain === "external-spec"
      ? fileReadTarget.externalSpecLogicalPath
      : null;
  const [state, setState] = useState<PreviewState>({
    payload: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({
        payload: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    const sourceKind = renderProfile.previewSourceKind;
    if (!sourceKind) {
      setState({
        payload: {
          kind: "unsupported",
          sourceKind: null,
          reason: "missing-handle",
          detail: "Preview source kind is unavailable.",
        },
        isLoading: false,
        error: null,
      });
      return;
    }

    if (fileReadTargetDomain === "invalid") {
      setState({
        payload: {
          kind: "unsupported",
          sourceKind,
          reason: "invalid-path",
          detail: "Invalid file path.",
        },
        isLoading: false,
        error: null,
      });
      return;
    }

    if (sourceKind === "asset-url") {
      try {
        setState({
          payload: {
            kind: "asset-url",
            sourceKind,
            absolutePath,
            assetUrl: convertFileSrc(absolutePath),
            extension: renderProfile.extension,
            byteLength: null,
          },
          isLoading: false,
          error: null,
        });
      } catch (error) {
        setState({
          payload: {
            kind: "unsupported",
            sourceKind,
            reason: "load-failed",
            detail: error instanceof Error ? error.message : String(error),
            absolutePath,
            extension: renderProfile.extension,
          },
          isLoading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (sourceKind === "inline-bytes") {
      setState({
        payload: {
          kind: "inline-bytes",
          sourceKind,
          text: content,
          extension: renderProfile.extension,
          byteLength: new TextEncoder().encode(content).length,
          truncated,
        },
        isLoading: false,
        error: null,
      });
      return;
    }

    const request = resolvePreviewHandleRequest(
      fileReadTargetDomain,
      workspaceRelativePath,
      normalizedInputPath,
      externalSpecLogicalPath,
      customSpecRoot,
    );
    if (!request) {
      setState({
        payload: {
          kind: "unsupported",
          sourceKind,
          reason: "missing-handle",
          detail: "Preview handle request could not be resolved.",
          extension: renderProfile.extension,
        },
        isLoading: false,
        error: null,
      });
      return;
    }

    let cancelled = false;
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;
    const abortController = new AbortController();
    setState((current) => ({
      payload: current.payload,
      isLoading: true,
      error: null,
    }));

    void (async () => {
      try {
        const handle = await resolveFilePreviewHandle(workspaceId, request);
        if (cancelled || currentRequestId !== requestIdRef.current) {
          return;
        }

        if (handle.extension === "doc") {
          setState({
            payload: {
              kind: "unsupported",
              sourceKind,
              reason: "legacy-doc",
              absolutePath: handle.absolutePath,
              extension: handle.extension,
              byteLength: handle.byteLength,
            },
            isLoading: false,
            error: null,
          });
          return;
        }

        if (sourceKind === "file-handle") {
          setState({
            payload: asPreviewHandlePayload(handle, "file-handle"),
            isLoading: false,
            error: null,
          });
          return;
        }

        if (handle.byteLength > MAX_DOCUMENT_PREVIEW_BYTES) {
          setState({
            payload: {
              kind: "unsupported",
              sourceKind,
              reason: "budget-exceeded",
              absolutePath: handle.absolutePath,
              extension: handle.extension,
              byteLength: handle.byteLength,
              budgetMegabytes: MAX_DOCUMENT_PREVIEW_MB,
            },
            isLoading: false,
            error: null,
          });
          return;
        }

        const fileHandlePayload = asPreviewHandlePayload(handle, "extracted-structure");
        const response = await fetch(fileHandlePayload.assetUrl, {
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to load preview source: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const mammoth = await import("mammoth");
        const conversion = await mammoth.convertToHtml({ arrayBuffer });
        if (cancelled || currentRequestId !== requestIdRef.current) {
          return;
        }
        setState({
          payload: {
            kind: "extracted-structure",
            sourceKind,
            absolutePath: fileHandlePayload.absolutePath,
            assetUrl: fileHandlePayload.assetUrl,
            extension: handle.extension,
            byteLength: handle.byteLength,
            html: DOMPurify.sanitize(conversion.value, {
              USE_PROFILES: { html: true },
            }),
            warnings: conversion.messages.map((item) => item.message),
          },
          isLoading: false,
          error: null,
        });
      } catch (error) {
        if (cancelled || currentRequestId !== requestIdRef.current) {
          return;
        }
        if (abortController.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setState({
          payload: {
            kind: "unsupported",
            sourceKind,
            reason: "load-failed",
            detail: message,
            extension: renderProfile.extension,
          },
          isLoading: false,
          error: message,
        });
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    absolutePath,
    content,
    customSpecRoot,
    enabled,
    externalSpecLogicalPath,
    fileReadTargetDomain,
    normalizedInputPath,
    renderProfile.extension,
    renderProfile.previewSourceKind,
    truncated,
    workspaceRelativePath,
    workspaceId,
  ]);

  return state;
}
