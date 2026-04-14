import {
  resolveFileLanguageFromPath,
  type EditorLanguageId,
} from "../../../utils/fileLanguageRegistry";

export type StructuredPreviewKind = "shell" | "dockerfile";

export type FileRenderKind =
  | "image"
  | "markdown"
  | "structured"
  | "code"
  | "text"
  | "pdf"
  | "tabular"
  | "document"
  | "binary-unsupported";

export type EditCapability = "full" | "plain-text" | "read-only";

export type FilePreviewMode =
  | "image-preview"
  | "markdown-preview"
  | "structured-preview"
  | "code-preview"
  | "text-preview"
  | "pdf-preview"
  | "tabular-preview"
  | "document-preview"
  | "binary-unsupported";

export type PreviewSourceKind =
  | "asset-url"
  | "file-handle"
  | "inline-bytes"
  | "extracted-structure";

export type FallbackBehavior =
  | "plain-text-preview"
  | "plain-text-editor"
  | "binary-unsupported"
  | "image-preview"
  | "external-open";

export type FileRenderProfile = {
  kind: FileRenderKind;
  previewMode: FilePreviewMode;
  previewSourceKind: PreviewSourceKind | null;
  extension: string | null;
  normalizedLookupPath: string;
  filenameMatchKey: string;
  previewLanguage: string | null;
  editorLanguage: EditorLanguageId | null;
  structuredKind: StructuredPreviewKind | null;
  editCapability: EditCapability;
  fallbackBehavior: FallbackBehavior;
};

export type FilePreviewMetrics = {
  byteLength: number;
  lineCount: number;
  truncated: boolean;
};

type PreviewBudget = {
  maxBytes: number;
  maxLines: number;
};

const MARKDOWN_EXTENSIONS = new Set(["md", "mdx"]);

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp",
  "avif", "bmp", "heic", "heif", "tif", "tiff", "ico",
]);

const PDF_EXTENSIONS = new Set(["pdf"]);

const TABULAR_TEXT_EXTENSIONS = new Set(["csv"]);

const TABULAR_BINARY_EXTENSIONS = new Set(["xls", "xlsx"]);

const DOCUMENT_EXTENSIONS = new Set(["doc", "docx"]);

const BINARY_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  "mp3", "wav", "ogg", "flac", "aac", "m4a", "wma",
  "mp4", "mov", "avi", "mkv", "wmv", "flv", "webm",
  "zip", "tar", "gz", "rar", "7z", "bz2",
  ...PDF_EXTENSIONS,
  ...TABULAR_BINARY_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  "ppt", "pptx",
  "exe", "dll", "so", "dylib", "bin", "dmg", "iso",
  "ttf", "otf", "woff", "woff2", "eot",
  "class", "o", "a", "lib", "pyc", "wasm",
]);

const SHELL_SCRIPT_EXTENSIONS = new Set([
  "sh",
  "bash",
  "zsh",
  "ksh",
  "dash",
  "command",
]);

const SHELL_SCRIPT_FILENAMES = new Set([
  ".envrc",
  "envrc",
  ".bashrc",
  "bashrc",
  ".zshrc",
  "zshrc",
  ".kshrc",
  "kshrc",
  ".profile",
  "profile",
]);

const PREVIEW_BUDGETS: Record<Extract<FileRenderKind, "code" | "markdown" | "structured">, PreviewBudget> = {
  code: {
    maxBytes: 200_000,
    maxLines: 8_000,
  },
  markdown: {
    maxBytes: 150_000,
    maxLines: 5_000,
  },
  structured: {
    maxBytes: 120_000,
    maxLines: 3_000,
  },
};

export function normalizeRenderLookupPath(path?: string | null) {
  return (path ?? "").replace(/\\/g, "/");
}

function fileNameFromPath(path?: string | null) {
  const normalized = normalizeRenderLookupPath(path);
  return normalized.split("/").pop() ?? normalized;
}

export function fileNameMatchKeyFromPath(path?: string | null) {
  return fileNameFromPath(path).toLowerCase();
}

export function fileExtensionFromPath(path?: string | null) {
  const fileName = fileNameMatchKeyFromPath(path);
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return null;
  }
  return fileName.slice(dotIndex + 1);
}

export function isMarkdownPath(path?: string | null) {
  const ext = fileExtensionFromPath(path);
  return ext ? MARKDOWN_EXTENSIONS.has(ext) : false;
}

export function isImagePath(path?: string | null) {
  const ext = fileExtensionFromPath(path);
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
}

export function isPdfPath(path?: string | null) {
  const ext = fileExtensionFromPath(path);
  return ext ? PDF_EXTENSIONS.has(ext) : false;
}

export function isTabularPath(path?: string | null) {
  const ext = fileExtensionFromPath(path);
  return ext ? TABULAR_TEXT_EXTENSIONS.has(ext) || TABULAR_BINARY_EXTENSIONS.has(ext) : false;
}

export function isDocumentPath(path?: string | null) {
  const ext = fileExtensionFromPath(path);
  return ext ? DOCUMENT_EXTENSIONS.has(ext) : false;
}

export function isBinaryPath(path?: string | null) {
  const ext = fileExtensionFromPath(path);
  return ext ? BINARY_EXTENSIONS.has(ext) : false;
}

export function resolveStructuredPreviewKind(path: string): StructuredPreviewKind | null {
  const fileName = fileNameMatchKeyFromPath(path);
  if (!fileName) {
    return null;
  }
  if (/^dockerfile(?:\.[^/]+)?$/i.test(fileName)) {
    return "dockerfile";
  }
  if (SHELL_SCRIPT_FILENAMES.has(fileName)) {
    return "shell";
  }
  const extension = fileExtensionFromPath(fileName);
  if (extension && SHELL_SCRIPT_EXTENSIONS.has(extension)) {
    return "shell";
  }
  return null;
}

export function resolveFileRenderProfile(path?: string | null): FileRenderProfile {
  const normalizedLookupPath = normalizeRenderLookupPath(path);
  const filenameMatchKey = fileNameMatchKeyFromPath(path);
  const extension = fileExtensionFromPath(path);
  const languageResolution = resolveFileLanguageFromPath(normalizedLookupPath);
  const structuredKind = normalizedLookupPath
    ? resolveStructuredPreviewKind(normalizedLookupPath)
    : null;

  if (isImagePath(normalizedLookupPath)) {
    return {
      kind: "image",
      previewMode: "image-preview",
      previewSourceKind: "asset-url",
      extension,
      normalizedLookupPath,
      filenameMatchKey,
      previewLanguage: null,
      editorLanguage: null,
      structuredKind: null,
      editCapability: "read-only",
      fallbackBehavior: "image-preview",
    };
  }

  if (isPdfPath(normalizedLookupPath)) {
    return {
      kind: "pdf",
      previewMode: "pdf-preview",
      previewSourceKind: "file-handle",
      extension,
      normalizedLookupPath,
      filenameMatchKey,
      previewLanguage: null,
      editorLanguage: null,
      structuredKind: null,
      editCapability: "read-only",
      fallbackBehavior: "external-open",
    };
  }

  if (isTabularPath(normalizedLookupPath)) {
    const isTabularText = extension != null && TABULAR_TEXT_EXTENSIONS.has(extension);
    return {
      kind: "tabular",
      previewMode: "tabular-preview",
      previewSourceKind: isTabularText ? "inline-bytes" : "file-handle",
      extension,
      normalizedLookupPath,
      filenameMatchKey,
      previewLanguage: languageResolution.previewLanguage,
      editorLanguage: languageResolution.editorLanguage,
      structuredKind: null,
      editCapability: isTabularText
        ? (languageResolution.editorLanguage ? "full" : "plain-text")
        : "read-only",
      fallbackBehavior: isTabularText ? "plain-text-preview" : "external-open",
    };
  }

  if (isDocumentPath(normalizedLookupPath)) {
    return {
      kind: "document",
      previewMode: "document-preview",
      previewSourceKind: extension === "docx" ? "extracted-structure" : "file-handle",
      extension,
      normalizedLookupPath,
      filenameMatchKey,
      previewLanguage: null,
      editorLanguage: null,
      structuredKind: null,
      editCapability: "read-only",
      fallbackBehavior: "external-open",
    };
  }

  if (isBinaryPath(normalizedLookupPath)) {
    return {
      kind: "binary-unsupported",
      previewMode: "binary-unsupported",
      previewSourceKind: null,
      extension,
      normalizedLookupPath,
      filenameMatchKey,
      previewLanguage: null,
      editorLanguage: null,
      structuredKind: null,
      editCapability: "read-only",
      fallbackBehavior: "binary-unsupported",
    };
  }

  if (isMarkdownPath(normalizedLookupPath)) {
    return {
      kind: "markdown",
      previewMode: "markdown-preview",
      previewSourceKind: "inline-bytes",
      extension,
      normalizedLookupPath,
      filenameMatchKey,
      previewLanguage: languageResolution.previewLanguage,
      editorLanguage: languageResolution.editorLanguage,
      structuredKind: null,
      editCapability: languageResolution.editorLanguage ? "full" : "plain-text",
      fallbackBehavior: "plain-text-preview",
    };
  }

  if (structuredKind) {
    return {
      kind: "structured",
      previewMode: "structured-preview",
      previewSourceKind: "inline-bytes",
      extension,
      normalizedLookupPath,
      filenameMatchKey,
      previewLanguage: languageResolution.previewLanguage,
      editorLanguage: languageResolution.editorLanguage,
      structuredKind,
      editCapability: languageResolution.editorLanguage ? "full" : "plain-text",
      fallbackBehavior: "plain-text-preview",
    };
  }

  return {
    kind: languageResolution.previewLanguage ? "code" : "text",
    previewMode: languageResolution.previewLanguage ? "code-preview" : "text-preview",
    previewSourceKind: "inline-bytes",
    extension,
    normalizedLookupPath,
    filenameMatchKey,
    previewLanguage: languageResolution.previewLanguage,
    editorLanguage: languageResolution.editorLanguage,
    structuredKind: null,
    editCapability: languageResolution.editorLanguage ? "full" : "plain-text",
    fallbackBehavior: "plain-text-preview",
  };
}

export function measureFilePreviewMetrics(
  value: string,
  truncated: boolean,
): FilePreviewMetrics {
  return {
    byteLength: new TextEncoder().encode(value).length,
    lineCount: value.length === 0 ? 0 : value.split(/\r?\n/).length,
    truncated,
  };
}

function resolvePreviewBudget(profile: FileRenderProfile): PreviewBudget | null {
  if (profile.kind === "code" || profile.kind === "markdown" || profile.kind === "structured") {
    return PREVIEW_BUDGETS[profile.kind];
  }
  return null;
}

export function shouldUseLowCostPreview(
  profile: FileRenderProfile,
  metrics: FilePreviewMetrics,
) {
  if (metrics.truncated) {
    return true;
  }
  const budget = resolvePreviewBudget(profile);
  if (!budget) {
    return false;
  }
  return metrics.byteLength > budget.maxBytes || metrics.lineCount > budget.maxLines;
}
