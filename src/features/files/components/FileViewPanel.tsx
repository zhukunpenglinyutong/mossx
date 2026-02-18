import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Eye from "lucide-react/dist/esm/icons/eye";
import Code from "lucide-react/dist/esm/icons/code";
import Save from "lucide-react/dist/esm/icons/save";
import X from "lucide-react/dist/esm/icons/x";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { keymap, type ViewUpdate } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown as cmMarkdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readWorkspaceFile, writeWorkspaceFile } from "../../../services/tauri";
import { highlightLine, languageFromPath } from "../../../utils/syntax";
import { Markdown } from "../../messages/components/Markdown";
import { OpenAppMenu } from "../../app/components/OpenAppMenu";
import { pushErrorToast } from "../../../services/toasts";
import type { OpenAppTarget } from "../../../types";
import type { Extension } from "@codemirror/state";

type FileViewPanelProps = {
  workspaceId: string;
  workspacePath: string;
  filePath: string;
  openTabs?: string[];
  activeTabPath?: string | null;
  onActivateTab?: (path: string) => void;
  onCloseTab?: (path: string) => void;
  onCloseAllTabs?: () => void;
  fileReferenceMode?: "path" | "none";
  onFileReferenceModeChange?: (mode: "path" | "none") => void;
  activeFileLineRange?: { startLine: number; endLine: number } | null;
  onActiveFileLineRangeChange?: (range: { startLine: number; endLine: number } | null) => void;
  initialMode?: "edit" | "preview";
  openTargets: OpenAppTarget[];
  openAppIconById: Record<string, string>;
  selectedOpenAppId: string;
  onSelectOpenAppId: (id: string) => void;
  onClose: () => void;
  onInsertText?: (text: string) => void;
};

const markdownExtensions = new Set(["md", "mdx"]);

function isMarkdownPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return markdownExtensions.has(ext);
}

const imageExtensions = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp",
  "avif", "bmp", "heic", "heif", "tif", "tiff", "ico",
]);

const binaryExtensions = new Set([
  // images
  ...imageExtensions,
  // audio
  "mp3", "wav", "ogg", "flac", "aac", "m4a", "wma",
  // video
  "mp4", "mov", "avi", "mkv", "wmv", "flv", "webm",
  // archives
  "zip", "tar", "gz", "rar", "7z", "bz2",
  // documents
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  // executables & binaries
  "exe", "dll", "so", "dylib", "bin", "dmg", "iso",
  // fonts
  "ttf", "otf", "woff", "woff2", "eot",
  // other
  "class", "o", "a", "lib", "pyc", "wasm",
]);

function isImagePath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return imageExtensions.has(ext);
}

function isBinaryPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return binaryExtensions.has(ext);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveAbsolutePath(workspacePath: string, relativePath: string) {
  const base = workspacePath.endsWith("/")
    ? workspacePath.slice(0, -1)
    : workspacePath;
  return `${base}/${relativePath}`;
}

function cmLangExtension(filePath: string): Extension[] {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "js":
    case "mjs":
      return [javascript()];
    case "jsx":
      return [javascript({ jsx: true })];
    case "ts":
      return [javascript({ typescript: true })];
    case "tsx":
      return [javascript({ jsx: true, typescript: true })];
    case "json":
      return [json()];
    case "html":
      return [html()];
    case "css":
    case "scss":
    case "sass":
      return [css()];
    case "md":
    case "mdx":
      return [cmMarkdown()];
    case "py":
      return [python()];
    case "rs":
      return [rust()];
    case "xml":
    case "svg":
      return [xml()];
    case "yaml":
    case "yml":
      return [yaml()];
    default:
      return [];
  }
}

export function FileViewPanel({
  workspaceId,
  workspacePath,
  filePath,
  openTabs,
  activeTabPath,
  onActivateTab,
  onCloseTab,
  onCloseAllTabs,
  fileReferenceMode = "path",
  onFileReferenceModeChange,
  activeFileLineRange = null,
  onActiveFileLineRangeChange,
  initialMode = "edit",
  openTargets,
  openAppIconById,
  selectedOpenAppId,
  onSelectOpenAppId,
  onClose,
  onInsertText,
}: FileViewPanelProps) {
  const { t } = useTranslation();
  const isMarkdown = useMemo(() => isMarkdownPath(filePath), [filePath]);
  const isImage = useMemo(() => isImagePath(filePath), [filePath]);
  const isBinary = useMemo(() => isBinaryPath(filePath), [filePath]);
  const [mode, setMode] = useState<"preview" | "edit">(initialMode);
  const [mdViewMode, setMdViewMode] = useState<"rendered" | "source">("rendered");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const savedContentRef = useRef("");
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const requestIdRef = useRef(0);
  const lastReportedLineRangeRef = useRef<string>("");
  const tabsContainerRef = useRef<HTMLDivElement | null>(null);
  const tabContextMenuRef = useRef<HTMLDivElement | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({
    visible: false,
    x: 0,
    y: 0,
  });
  const [fileReferenceShouldRender, setFileReferenceShouldRender] = useState(false);
  const [fileReferenceVisible, setFileReferenceVisible] = useState(false);

  const isDirty = content !== savedContentRef.current;
  const absolutePath = useMemo(
    () => resolveAbsolutePath(workspacePath, filePath),
    [workspacePath, filePath],
  );

  const imageSrc = useMemo(() => {
    if (!isImage) return null;
    try {
      return convertFileSrc(absolutePath);
    } catch {
      return null;
    }
  }, [isImage, absolutePath]);

  const [imageInfo, setImageInfo] = useState<{
    width: number;
    height: number;
    sizeBytes: number | null;
  } | null>(null);

  // Fetch image file size when imageSrc changes
  useEffect(() => {
    setImageInfo(null);
    if (!imageSrc) return;
    let cancelled = false;
    fetch(imageSrc)
      .then((res) => res.blob())
      .then((blob) => {
        if (!cancelled) {
          setImageInfo((prev) =>
            prev
              ? { ...prev, sizeBytes: blob.size }
              : { width: 0, height: 0, sizeBytes: blob.size },
          );
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [imageSrc]);

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      setImageInfo((prev) => ({
        width: img.naturalWidth,
        height: img.naturalHeight,
        sizeBytes: prev?.sizeBytes ?? null,
      }));
    },
    [],
  );

  // Load file content (skip for binary files)
  useEffect(() => {
    if (isBinary) {
      setIsLoading(false);
      setError(null);
      setContent("");
      savedContentRef.current = "";
      setTruncated(false);
      return;
    }

    let cancelled = false;
    requestIdRef.current += 1;
    const currentRequest = requestIdRef.current;
    setIsLoading(true);
    setError(null);

    readWorkspaceFile(workspaceId, filePath)
      .then((response) => {
        if (cancelled || currentRequest !== requestIdRef.current) return;
        setContent(response.content ?? "");
        savedContentRef.current = response.content ?? "";
        setTruncated(Boolean(response.truncated));
      })
      .catch((err) => {
        if (cancelled || currentRequest !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled && currentRequest === requestIdRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, filePath, isBinary]);

  // Reset mode when file changes
  useEffect(() => {
    setMode(initialMode);
    setMdViewMode("rendered");
    onActiveFileLineRangeChange?.(null);
    lastReportedLineRangeRef.current = "";
  }, [filePath, initialMode, onActiveFileLineRangeChange]);

  // Save handler
  const handleSave = useCallback(async () => {
    if (!isDirty || isSaving || truncated) return;
    setIsSaving(true);
    try {
      await writeWorkspaceFile(workspaceId, filePath, content);
      savedContentRef.current = content;
    } catch (err) {
      pushErrorToast({
        title: "Failed to save file",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSaving(false);
    }
  }, [workspaceId, filePath, content, isDirty, isSaving, truncated]);

  // Auto-focus CodeMirror when entering edit mode
  useEffect(() => {
    if (mode === "edit" && !isLoading && !truncated) {
      requestAnimationFrame(() => {
        cmRef.current?.view?.focus();
      });
    }
  }, [mode, isLoading, truncated]);

  // CodeMirror extensions (Mod-s handled inside CM; window-level handles preview mode)
  const cmExtensions = useMemo(() => {
    const langExt = cmLangExtension(filePath);
    return [...langExt];
  }, [filePath]);

  // Use ref to always have latest handleSave for CodeMirror keymap
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const saveKeymapExt = useMemo(
    () =>
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            handleSaveRef.current();
            return true;
          },
        },
      ]),
    [],
  );

  // Keyboard shortcut: Cmd+S / Ctrl+S (works in any mode, including preview)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  // Handle close with unsaved changes
  const handleClose = useCallback(() => {
    if (isDirty) {
      const confirmed = window.confirm(t("files.discardChangesMessage"));
      if (!confirmed) return;
    }
    onClose();
  }, [isDirty, onClose, t]);

  // Switch to edit mode
  const handleEnterEdit = useCallback(() => {
    if (truncated) return;
    setMode("edit");
    requestAnimationFrame(() => {
      cmRef.current?.view?.focus();
    });
  }, [truncated]);

  // Switch to preview mode
  const handleEnterPreview = useCallback(() => {
    setMode("preview");
    onActiveFileLineRangeChange?.(null);
    lastReportedLineRangeRef.current = "";
  }, [onActiveFileLineRangeChange]);

  // Syntax highlighted lines for code preview
  const language = useMemo(() => languageFromPath(filePath), [filePath]);
  const lines = useMemo(() => content.split("\n"), [content]);
  const highlightedLines = useMemo(
    () =>
      lines.map((line) => {
        const html = highlightLine(line, language);
        return html || "&nbsp;";
      }),
    [lines, language],
  );

  const visibleTabs = openTabs && openTabs.length > 0 ? openTabs : [filePath];
  const canCloseAllTabs = Boolean(onCloseAllTabs && visibleTabs.length > 0);
  const activeFileLineLabel = activeFileLineRange
    ? activeFileLineRange.startLine === activeFileLineRange.endLine
      ? `L${activeFileLineRange.startLine}`
      : `L${activeFileLineRange.startLine}-L${activeFileLineRange.endLine}`
    : null;

  useEffect(() => {
    if (activeFileLineLabel) {
      setFileReferenceShouldRender(true);
      setFileReferenceVisible(true);
      return;
    }
    if (!fileReferenceShouldRender) {
      return;
    }
    setFileReferenceVisible(false);
    const timerId = window.setTimeout(() => {
      setFileReferenceShouldRender(false);
    }, 120);
    return () => window.clearTimeout(timerId);
  }, [activeFileLineLabel, fileReferenceShouldRender]);

  const closeTabContextMenu = useCallback(() => {
    setTabContextMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, []);

  const openTabContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!canCloseAllTabs) {
        return;
      }
      event.preventDefault();
      const containerRect = tabsContainerRef.current?.getBoundingClientRect();
      if (!containerRect) {
        return;
      }
      const relativeX = event.clientX - containerRect.left;
      const relativeY = event.clientY - containerRect.top;
      const menuWidth = 156;
      const menuHeight = 44;
      const clampedX = Math.min(
        Math.max(4, relativeX),
        Math.max(4, containerRect.width - menuWidth - 4),
      );
      const clampedY = Math.min(
        Math.max(4, relativeY),
        Math.max(4, containerRect.height - menuHeight - 4),
      );
      setTabContextMenu({
        visible: true,
        x: clampedX,
        y: clampedY,
      });
    },
    [canCloseAllTabs],
  );

  const handleCloseAllTabs = useCallback(() => {
    onCloseAllTabs?.();
    closeTabContextMenu();
  }, [closeTabContextMenu, onCloseAllTabs]);

  useEffect(() => {
    if (!tabContextMenu.visible) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        closeTabContextMenu();
        return;
      }
      if (tabContextMenuRef.current?.contains(target)) {
        return;
      }
      closeTabContextMenu();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeTabContextMenu();
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [closeTabContextMenu, tabContextMenu.visible]);

  // ── Topbar ──
  const renderTopbar = () => (
    <div className="fvp-topbar">
      <div className="fvp-topbar-left">
        <button
          type="button"
          className="icon-button fvp-back"
          onClick={handleClose}
          aria-label={t("files.backToChat")}
          title={t("files.backToChat")}
        >
          <ArrowLeft size={16} aria-hidden />
        </button>
        <span className="fvp-filepath">{filePath}</span>
        {isDirty && <span className="fvp-dirty-dot" aria-label={t("files.unsavedChanges")} />}
        {truncated && <span className="fvp-truncated">{t("files.truncated")}</span>}
      </div>
      <div className="fvp-topbar-right">
        {!isBinary && (
          <>
            {isMarkdown && mode === "preview" && (
              <div className="fvp-toggle-group">
                <button
                  type="button"
                  className={`ghost fvp-toggle-btn ${mdViewMode === "rendered" ? "is-active" : ""}`}
                  onClick={() => setMdViewMode("rendered")}
                >
                  <Eye size={14} aria-hidden />
                  <span>{t("files.preview")}</span>
                </button>
                <button
                  type="button"
                  className={`ghost fvp-toggle-btn ${mdViewMode === "source" ? "is-active" : ""}`}
                  onClick={() => setMdViewMode("source")}
                >
                  <Code size={14} aria-hidden />
                  <span>{t("files.source")}</span>
                </button>
              </div>
            )}
            {mode === "preview" ? (
              <button
                type="button"
                className="ghost fvp-action-btn"
                onClick={handleEnterEdit}
                disabled={truncated}
                title={truncated ? t("files.fileTooLarge") : t("files.edit")}
              >
                <Pencil size={14} aria-hidden />
                <span>{t("files.edit")}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="ghost fvp-action-btn"
                  onClick={handleEnterPreview}
                >
                  <Eye size={14} aria-hidden />
                  <span>{t("files.preview")}</span>
                </button>
                <button
                  type="button"
                  className={`primary fvp-action-btn fvp-save-btn ${isDirty ? "" : "is-saved"}`}
                  onClick={handleSave}
                  disabled={!isDirty || isSaving}
                >
                  <Save size={14} aria-hidden />
                  <span>{isSaving ? t("files.saving") : isDirty ? t("files.save") : t("files.saved")}</span>
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );

  const renderTabs = () => (
    <div
      ref={tabsContainerRef}
      className="fvp-tabs"
      role="tablist"
      aria-label="Open files"
      onContextMenu={openTabContextMenu}
    >
      {visibleTabs.map((tabPath) => {
        const isActive = (activeTabPath ?? filePath) === tabPath;
        const tabName = tabPath.split("/").pop() || tabPath;
        return (
          <div
            key={tabPath}
            className={`fvp-tab ${isActive ? "is-active" : ""}`}
            role="presentation"
          >
            <button
              type="button"
              className="fvp-tab-main"
              role="tab"
              aria-selected={isActive}
              onClick={() => onActivateTab?.(tabPath)}
              onContextMenu={openTabContextMenu}
              title={tabPath}
            >
              {tabName}
            </button>
            {onCloseTab ? (
              <button
                type="button"
                className="fvp-tab-close"
                aria-label={`Close ${tabName}`}
                onClick={() => onCloseTab(tabPath)}
                onContextMenu={openTabContextMenu}
              >
                <X size={12} aria-hidden />
              </button>
            ) : null}
          </div>
        );
      })}
      {tabContextMenu.visible && canCloseAllTabs ? (
        <div
          ref={tabContextMenuRef}
          className="fvp-tab-context-menu"
          role="menu"
          style={{ left: `${tabContextMenu.x}px`, top: `${tabContextMenu.y}px` }}
        >
          <button
            type="button"
            className="fvp-tab-context-menu-item"
            role="menuitem"
            onClick={handleCloseAllTabs}
          >
            {t("files.closeAllTabs")}
          </button>
        </div>
      ) : null}
    </div>
  );

  // ── Content area ──
  const renderContent = () => {
    if (isLoading) {
      return <div className="fvp-status">{t("files.loadingFile")}</div>;
    }
    if (error) {
      return <div className="fvp-status fvp-error">{error}</div>;
    }

    // Image preview
    if (isImage) {
      return (
        <div className="fvp-image-preview">
          {imageSrc ? (
            <div className="fvp-image-preview-inner">
              <img
                src={imageSrc}
                alt={filePath}
                className="fvp-image-preview-img"
                draggable={false}
                onLoad={handleImageLoad}
              />
              {imageInfo && (
                <span className="fvp-image-info">
                  {imageInfo.width > 0 && `${imageInfo.width} × ${imageInfo.height}`}
                  {imageInfo.width > 0 && imageInfo.sizeBytes != null && " · "}
                  {imageInfo.sizeBytes != null && formatFileSize(imageInfo.sizeBytes)}
                </span>
              )}
            </div>
          ) : (
            <div className="fvp-status fvp-error">
              {t("files.imagePreview")}
            </div>
          )}
        </div>
      );
    }

    // Other binary files (audio, video, archives, etc.)
    if (isBinary) {
      return (
        <div className="fvp-status">{t("files.unsupportedFormat")}</div>
      );
    }

    // Edit mode
    if (mode === "edit") {
      if (isMarkdown) {
        // Split pane: editor on left, preview on right
        return (
          <div className="fvp-split">
            <div className="fvp-split-editor">
              <CodeMirror
                ref={cmRef}
                value={content}
                onChange={setContent}
                onUpdate={(update: ViewUpdate) => {
                  if (!update.selectionSet) {
                    return;
                  }
                  const mainSelection = update.state.selection.main;
                  const from = Math.min(mainSelection.from, mainSelection.to);
                  const to = Math.max(mainSelection.from, mainSelection.to);
                  const startLine = update.state.doc.lineAt(from).number;
                  const endLine = update.state.doc.lineAt(to).number;
                  const rangeKey = `${startLine}-${endLine}`;
                  if (rangeKey === lastReportedLineRangeRef.current) {
                    return;
                  }
                  lastReportedLineRangeRef.current = rangeKey;
                  onActiveFileLineRangeChange?.({ startLine, endLine });
                }}
                extensions={[saveKeymapExt, ...cmExtensions]}
                theme="dark"
                className="fvp-cm"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  highlightActiveLine: true,
                  indentOnInput: true,
                  tabSize: 2,
                }}
              />
            </div>
            <div className="fvp-split-divider" />
            <div className="fvp-split-preview">
              <Markdown
                value={content}
                className="fvp-markdown"
                codeBlockStyle="message"
              />
            </div>
          </div>
        );
      }
      // Code edit: CodeMirror with syntax highlighting
      return (
        <div className="fvp-editor">
          <CodeMirror
            ref={cmRef}
            value={content}
            onChange={setContent}
            onUpdate={(update: ViewUpdate) => {
              if (!update.selectionSet) {
                return;
              }
              const mainSelection = update.state.selection.main;
              const from = Math.min(mainSelection.from, mainSelection.to);
              const to = Math.max(mainSelection.from, mainSelection.to);
              const startLine = update.state.doc.lineAt(from).number;
              const endLine = update.state.doc.lineAt(to).number;
              const rangeKey = `${startLine}-${endLine}`;
              if (rangeKey === lastReportedLineRangeRef.current) {
                return;
              }
              lastReportedLineRangeRef.current = rangeKey;
              onActiveFileLineRangeChange?.({ startLine, endLine });
            }}
            extensions={[saveKeymapExt, ...cmExtensions]}
            theme="dark"
            className="fvp-cm"
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              bracketMatching: true,
              closeBrackets: true,
              highlightActiveLine: true,
              indentOnInput: true,
              tabSize: 2,
            }}
          />
        </div>
      );
    }

    // Preview mode: Markdown rendered
    if (isMarkdown && mdViewMode === "rendered") {
      return (
        <div className="fvp-preview-scroll">
          <Markdown
            value={content}
            className="fvp-markdown"
            codeBlockStyle="message"
          />
        </div>
      );
    }

    // Preview mode: code (or markdown source)
    return (
      <div className="fvp-code-preview" role="list">
        {lines.map((_, index) => {
          const html = highlightedLines[index] ?? "&nbsp;";
          return (
            <div key={`line-${index}`} className="fvp-code-line">
              <span className="fvp-line-number">{index + 1}</span>
              <span
                className="fvp-line-text"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  // ── Footer ──
  const renderFooter = () => (
    <div className="fvp-footer">
      <div className="fvp-footer-left">
        {!isBinary && mode === "edit" && isDirty && (
          <span className="fvp-footer-hint">
            <span className="fvp-dirty-dot" />
            {t("files.unsavedChanges")}
            <span className="fvp-footer-shortcut">{t("files.saveShortcut")}</span>
          </span>
        )}
        {!isBinary && mode === "edit" && !isDirty && (
          <span className="fvp-footer-hint fvp-footer-saved">{t("files.saved")}</span>
        )}
        {!isBinary && mode === "preview" && truncated && (
          <span className="fvp-footer-hint">{t("files.readOnly")}</span>
        )}
      </div>
      <div className="fvp-footer-right">
        {fileReferenceShouldRender ? (
          <div
            className={`fvp-file-reference-bar${fileReferenceVisible ? " is-visible" : ""}`}
            role="group"
            aria-label={t("composer.fileReference")}
          >
            <span className="fvp-file-reference-label">{t("composer.activeFile")}:</span>
            <code className="fvp-file-reference-path" title={filePath}>
              {filePath.split("/").pop() || filePath}
            </code>
            {activeFileLineLabel ? (
              <span className="fvp-file-reference-lines">{activeFileLineLabel}</span>
            ) : null}
            <button
              type="button"
              className={`fvp-file-reference-toggle${fileReferenceMode === "path" ? " is-active" : ""}`}
              onClick={() =>
                onFileReferenceModeChange?.(fileReferenceMode === "path" ? "none" : "path")
              }
              title={t("composer.fileReferenceHint")}
            >
              {fileReferenceMode === "path"
                ? t("composer.fileReferencePathOn")
                : t("composer.fileReferencePathOff")}
            </button>
          </div>
        ) : null}
        {!isBinary && mode === "preview" && onInsertText && (
          <button
            type="button"
            className="ghost fvp-action-btn"
            onClick={() => {
              const fence = language ? `\`\`\`${language}` : "```";
              const snippet = `${filePath}\n${fence}\n${content}\n\`\`\``;
              onInsertText(snippet);
            }}
          >
            {t("files.addToChat")}
          </button>
        )}
        <OpenAppMenu
          path={absolutePath}
          openTargets={openTargets}
          selectedOpenAppId={selectedOpenAppId}
          onSelectOpenAppId={onSelectOpenAppId}
          iconById={openAppIconById}
        />
      </div>
    </div>
  );

  return (
    <div className="fvp">
      {renderTabs()}
      {renderTopbar()}
      <div className="fvp-body">{renderContent()}</div>
      {renderFooter()}
    </div>
  );
}
