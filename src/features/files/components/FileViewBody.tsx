import type {
  MutableRefObject,
  RefObject,
  SyntheticEvent,
} from "react";
import CodeMirror, {
  type ReactCodeMirrorProps,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import { FileDocumentPreview } from "./FileDocumentPreview";
import { FileMarkdownPreview } from "./FileMarkdownPreview";
import { FilePdfPreview } from "./FilePdfPreview";
import { FileStructuredPreview } from "./FileStructuredPreview";
import { FileTabularPreview } from "./FileTabularPreview";
import type { FilePreviewPayload } from "../hooks/useFilePreviewPayload";
import type { FileViewSurface } from "../utils/fileViewSurface";

type FileViewBodyProps = {
  filePath: string;
  imageSrc: string | null;
  imageInfo: { width: number; height: number; sizeBytes: number | null } | null;
  handleImageLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
  error: string | null;
  isLoading: boolean;
  previewPayload: FilePreviewPayload | null;
  previewPayloadLoading: boolean;
  previewPayloadError: string | null;
  viewSurface: FileViewSurface;
  content: string;
  setContent: (value: string) => void;
  cmRef: RefObject<ReactCodeMirrorRef | null>;
  handleCodeMirrorCreate: NonNullable<ReactCodeMirrorProps["onCreateEditor"]>;
  onActiveFileLineRangeChange?: (range: { startLine: number; endLine: number } | null) => void;
  lastReportedLineRangeRef: MutableRefObject<string>;
  editorExtensions: ReactCodeMirrorProps["extensions"];
  editorTheme: ReactCodeMirrorProps["theme"];
  highlightedLines: string[];
  lines: string[];
  gitAddedLineNumberSet: Set<number>;
  gitModifiedLineNumberSet: Set<number>;
  formatFileSize: (bytes: number) => string;
  t: (key: string) => string;
};

export function FileViewBody({
  filePath,
  imageSrc,
  imageInfo,
  handleImageLoad,
  error,
  isLoading,
  previewPayload,
  previewPayloadLoading,
  previewPayloadError,
  viewSurface,
  content,
  setContent,
  cmRef,
  handleCodeMirrorCreate,
  onActiveFileLineRangeChange,
  lastReportedLineRangeRef,
  editorExtensions,
  editorTheme,
  highlightedLines,
  lines,
  gitAddedLineNumberSet,
  gitModifiedLineNumberSet,
  formatFileSize,
  t,
}: FileViewBodyProps) {
  if (isLoading) {
    return <div className="fvp-status">{t("files.loadingFile")}</div>;
  }
  if (error) {
    return <div className="fvp-status fvp-error">{error}</div>;
  }

  if (viewSurface.kind === "image") {
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
            {imageInfo ? (
              <span className="fvp-image-info">
                {imageInfo.width > 0 && `${imageInfo.width} × ${imageInfo.height}`}
                {imageInfo.width > 0 && imageInfo.sizeBytes != null && " · "}
                {imageInfo.sizeBytes != null ? formatFileSize(imageInfo.sizeBytes) : null}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="fvp-status fvp-error">{t("files.imagePreview")}</div>
        )}
      </div>
    );
  }

  if (viewSurface.kind === "binary-unsupported") {
    return <div className="fvp-status">{t("files.unsupportedFormat")}</div>;
  }

  if (viewSurface.kind === "pdf-preview") {
    return (
      <FilePdfPreview
        assetUrl={
          previewPayload?.kind === "file-handle" || previewPayload?.kind === "asset-url"
            ? previewPayload.assetUrl
            : null
        }
        isLoading={previewPayloadLoading}
        error={previewPayloadError}
        t={t}
      />
    );
  }

  if (viewSurface.kind === "tabular-preview") {
    return (
      <FileTabularPreview
        payload={previewPayload}
        isLoading={previewPayloadLoading}
        error={previewPayloadError}
        t={t}
      />
    );
  }

  if (viewSurface.kind === "document-preview") {
    return (
      <FileDocumentPreview
        payload={previewPayload}
        isLoading={previewPayloadLoading}
        error={previewPayloadError}
        t={t}
      />
    );
  }

  if (viewSurface.kind === "editor") {
    return (
      <div className="fvp-editor">
        <CodeMirror
          key={filePath}
          ref={cmRef}
          value={content}
          onChange={setContent}
          onCreateEditor={handleCodeMirrorCreate}
          onUpdate={(update) => {
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
          extensions={editorExtensions}
          theme={editorTheme}
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

  if (viewSurface.kind === "markdown-preview") {
    return (
      <div className="fvp-preview-scroll">
        <FileMarkdownPreview
          key={filePath}
          value={content}
          className="fvp-file-markdown fvp-markdown-github"
        />
      </div>
    );
  }

  if (viewSurface.kind === "structured-preview") {
    return (
      <div className="fvp-preview-scroll">
        <FileStructuredPreview
          key={filePath}
          filePath={filePath}
          value={content}
          className="fvp-structured-preview"
        />
      </div>
    );
  }

  return (
    <div className="fvp-code-preview" role="list">
      {lines.map((_, index) => {
        const html = highlightedLines[index] ?? "&nbsp;";
        const lineNumber = index + 1;
        const isGitAddedLine = gitAddedLineNumberSet.has(lineNumber);
        const isGitModifiedLine = gitModifiedLineNumberSet.has(lineNumber);
        return (
          <div
            key={`line-${index}`}
            className={`fvp-code-line${isGitModifiedLine ? " is-git-modified" : isGitAddedLine ? " is-git-added" : ""}`}
          >
            <span className="fvp-line-number">{lineNumber}</span>
            <span
              className="fvp-line-text"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        );
      })}
    </div>
  );
}
