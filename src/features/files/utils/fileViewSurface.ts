import {
  shouldUseLowCostPreview,
  type FilePreviewMetrics,
  type FileRenderProfile,
} from "./fileRenderProfile";

export type FileViewMode = "preview" | "edit";

export type FileViewSurfaceKind =
  | "image"
  | "binary-unsupported"
  | "editor"
  | "markdown-preview"
  | "structured-preview"
  | "code-preview"
  | "pdf-preview"
  | "tabular-preview"
  | "document-preview";

export type FileViewSurface = {
  kind: FileViewSurfaceKind;
  useLowCostPreview: boolean;
};

export function resolveDefaultFileViewMode(
  renderProfile: FileRenderProfile,
  initialMode: FileViewMode,
): FileViewMode {
  if (
    renderProfile.kind === "markdown" ||
    renderProfile.editCapability === "read-only" ||
    renderProfile.kind === "tabular"
  ) {
    return "preview";
  }
  return initialMode;
}

export function resolveFileViewSurface(
  renderProfile: FileRenderProfile,
  mode: FileViewMode,
  metrics: FilePreviewMetrics,
): FileViewSurface {
  const useLowCostPreview = shouldUseLowCostPreview(renderProfile, metrics);

  if (renderProfile.kind === "image") {
    return {
      kind: "image",
      useLowCostPreview: false,
    };
  }

  if (renderProfile.kind === "binary-unsupported") {
    return {
      kind: "binary-unsupported",
      useLowCostPreview: false,
    };
  }

  if (mode === "edit" && renderProfile.editCapability !== "read-only") {
    return {
      kind: "editor",
      useLowCostPreview,
    };
  }

  switch (renderProfile.previewMode) {
    case "markdown-preview":
      if (!useLowCostPreview) {
        return {
          kind: "markdown-preview",
          useLowCostPreview: false,
        };
      }
      break;
    case "structured-preview":
      if (!useLowCostPreview) {
        return {
          kind: "structured-preview",
          useLowCostPreview: false,
        };
      }
      break;
    case "pdf-preview":
      return {
        kind: "pdf-preview",
        useLowCostPreview: false,
      };
    case "tabular-preview":
      return {
        kind: "tabular-preview",
        useLowCostPreview: false,
      };
    case "document-preview":
      return {
        kind: "document-preview",
        useLowCostPreview: false,
      };
    case "image-preview":
      return {
        kind: "image",
        useLowCostPreview: false,
      };
    case "binary-unsupported":
      return {
        kind: "binary-unsupported",
        useLowCostPreview: false,
      };
    default:
      break;
  }

  return {
    kind: "code-preview",
    useLowCostPreview,
  };
}
