import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  readExternalAbsoluteFile,
  readExternalSpecFile,
  readWorkspaceFile,
  writeExternalSpecFile,
  writeWorkspaceFile,
} from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import type { FileReadTarget } from "../../../utils/workspacePaths";

type UseFileDocumentStateArgs = {
  workspaceId: string;
  customSpecRoot: string | null;
  workspaceRelativeFilePath: string;
  fileReadTarget: FileReadTarget;
  skipTextRead: boolean;
  externalAbsoluteReadOnlyMessage: string;
};

export function useFileDocumentState({
  workspaceId,
  customSpecRoot,
  workspaceRelativeFilePath,
  fileReadTarget,
  skipTextRead,
  externalAbsoluteReadOnlyMessage,
}: UseFileDocumentStateArgs) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const savedContentRef = useRef("");
  const latestIsDirtyRef = useRef(false);
  const externalDiskSnapshotRef = useRef<{ content: string; truncated: boolean } | null>(null);
  const requestIdRef = useRef(0);
  const saveRequestIdRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const latestContentRef = useRef(content);
  const fileReadTargetDomain = fileReadTarget.domain;
  const fileReadNormalizedInputPath = fileReadTarget.normalizedInputPath;
  const fileReadExternalSpecLogicalPath =
    fileReadTargetDomain === "external-spec"
      ? fileReadTarget.externalSpecLogicalPath
      : null;

  const isDirty = useMemo(() => content !== savedContentRef.current, [content]);
  latestIsDirtyRef.current = isDirty;
  latestContentRef.current = content;

  useEffect(() => {
    if (skipTextRead) {
      setIsLoading(false);
      setError(null);
      setContent("");
      savedContentRef.current = "";
      setTruncated(false);
      externalDiskSnapshotRef.current = null;
      return;
    }

    let cancelled = false;
    requestIdRef.current += 1;
    saveRequestIdRef.current += 1;
    saveInFlightRef.current = false;
    const currentRequest = requestIdRef.current;
    setIsLoading(true);
    setIsSaving(false);
    setError(null);

    if (fileReadTargetDomain === "invalid") {
      setError("Invalid file path");
      setContent("");
      savedContentRef.current = "";
      setTruncated(false);
      externalDiskSnapshotRef.current = null;
      setIsLoading(false);
      return;
    }

    const readPromise =
      fileReadTargetDomain === "external-spec" && customSpecRoot && fileReadExternalSpecLogicalPath
        ? readExternalSpecFile(
            workspaceId,
            customSpecRoot,
            fileReadExternalSpecLogicalPath,
          ).then((response) => {
            if (!response.exists) {
              throw new Error("Failed to open file: File does not exist");
            }
            return {
              content: response.content ?? "",
              truncated: Boolean(response.truncated),
            };
          })
        : fileReadTargetDomain === "external-absolute"
          ? readExternalAbsoluteFile(
              workspaceId,
              fileReadNormalizedInputPath,
            )
          : readWorkspaceFile(workspaceId, workspaceRelativeFilePath);

    readPromise
      .then((response) => {
        if (cancelled || currentRequest !== requestIdRef.current) return;
        const nextContent = response.content ?? "";
        const nextTruncated = Boolean(response.truncated);
        setContent(nextContent);
        savedContentRef.current = nextContent;
        setTruncated(nextTruncated);
        externalDiskSnapshotRef.current = {
          content: nextContent,
          truncated: nextTruncated,
        };
      })
      .catch((readError) => {
        if (cancelled || currentRequest !== requestIdRef.current) return;
        setError(readError instanceof Error ? readError.message : String(readError));
      })
      .finally(() => {
        if (!cancelled && currentRequest === requestIdRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    customSpecRoot,
    fileReadExternalSpecLogicalPath,
    fileReadNormalizedInputPath,
    fileReadTargetDomain,
    skipTextRead,
    workspaceId,
    workspaceRelativeFilePath,
  ]);

  const handleSave = useCallback(async () => {
    if (!isDirty || isSaving || truncated || saveInFlightRef.current) {
      return false;
    }
    const saveRequestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = saveRequestId;
    const contentToSave = latestContentRef.current;
    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      if (
        fileReadTargetDomain === "external-spec" &&
        customSpecRoot &&
        fileReadExternalSpecLogicalPath
      ) {
        await writeExternalSpecFile(
          workspaceId,
          customSpecRoot,
          fileReadExternalSpecLogicalPath,
          contentToSave,
        );
      } else if (fileReadTargetDomain === "external-absolute") {
        throw new Error(externalAbsoluteReadOnlyMessage);
      } else if (fileReadTargetDomain === "invalid") {
        throw new Error("Invalid file path");
      } else {
        await writeWorkspaceFile(workspaceId, workspaceRelativeFilePath, contentToSave);
      }
      if (saveRequestId !== saveRequestIdRef.current) {
        return false;
      }
      savedContentRef.current = contentToSave;
      externalDiskSnapshotRef.current = {
        content: contentToSave,
        truncated,
      };
      return true;
    } catch (saveError) {
      if (saveRequestId !== saveRequestIdRef.current) {
        return false;
      }
      pushErrorToast({
        title: "Failed to save file",
        message: saveError instanceof Error ? saveError.message : String(saveError),
      });
      return false;
    } finally {
      if (saveRequestId === saveRequestIdRef.current) {
        saveInFlightRef.current = false;
        setIsSaving(false);
      }
    }
  }, [
    customSpecRoot,
    externalAbsoluteReadOnlyMessage,
    fileReadExternalSpecLogicalPath,
    fileReadTargetDomain,
    isDirty,
    isSaving,
    truncated,
    workspaceId,
    workspaceRelativeFilePath,
  ]);

  return {
    content,
    setContent,
    isLoading,
    isSaving,
    error,
    truncated,
    setTruncated,
    isDirty,
    savedContentRef,
    latestIsDirtyRef,
    externalDiskSnapshotRef,
    handleSave,
  };
}
