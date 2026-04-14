import { describe, expect, it } from "vitest";
import {
  measureFilePreviewMetrics,
  resolveFileRenderProfile,
  resolveStructuredPreviewKind,
  shouldUseLowCostPreview,
} from "./fileRenderProfile";

describe("fileRenderProfile", () => {
  it("resolves frozen in-scope render profiles consistently across path styles", () => {
    expect(resolveFileRenderProfile("src/App.vue")).toMatchObject({
      kind: "code",
      previewLanguage: "markup",
      editorLanguage: null,
      editCapability: "plain-text",
    });

    expect(resolveFileRenderProfile("C:\\Repo\\docker-compose.YML")).toMatchObject({
      kind: "code",
      normalizedLookupPath: "C:/Repo/docker-compose.YML",
      filenameMatchKey: "docker-compose.yml",
      previewLanguage: "yaml",
      editorLanguage: "yaml",
      structuredKind: null,
      editCapability: "full",
    });

    expect(resolveFileRenderProfile("C:\\Repo\\.ENV.LOCAL")).toMatchObject({
      kind: "code",
      filenameMatchKey: ".env.local",
      previewLanguage: "ini",
      editorLanguage: "properties",
      editCapability: "full",
    });

    expect(resolveFileRenderProfile("/Users/dev/project/Dockerfile")).toMatchObject({
      kind: "structured",
      structuredKind: "dockerfile",
      previewLanguage: "bash",
      editorLanguage: "shell",
      editCapability: "full",
    });
  });

  it("keeps binary, image, markdown, and unknown text fallback semantics stable", () => {
    expect(resolveFileRenderProfile("assets/logo.SVG")).toMatchObject({
      kind: "image",
      previewMode: "image-preview",
      previewSourceKind: "asset-url",
      fallbackBehavior: "image-preview",
      editCapability: "read-only",
    });

    expect(resolveFileRenderProfile("artifacts/archive.zip")).toMatchObject({
      kind: "binary-unsupported",
      previewMode: "binary-unsupported",
      previewSourceKind: null,
      fallbackBehavior: "binary-unsupported",
      editCapability: "read-only",
    });

    expect(resolveFileRenderProfile("/Users/dev/project/README.md")).toMatchObject({
      kind: "markdown",
      previewMode: "markdown-preview",
      previewSourceKind: "inline-bytes",
      previewLanguage: "markdown",
      editorLanguage: "markdown",
      editCapability: "full",
    });

    expect(resolveFileRenderProfile("notes/README")).toMatchObject({
      kind: "text",
      previewMode: "text-preview",
      previewSourceKind: "inline-bytes",
      previewLanguage: null,
      editorLanguage: null,
      editCapability: "plain-text",
    });
  });

  it("resolves the document preview matrix without over-promising legacy binary formats", () => {
    expect(resolveFileRenderProfile("docs/report.pdf")).toMatchObject({
      kind: "pdf",
      previewMode: "pdf-preview",
      previewSourceKind: "file-handle",
      editCapability: "read-only",
    });

    expect(resolveFileRenderProfile("docs/spec-sheet.csv")).toMatchObject({
      kind: "tabular",
      previewMode: "tabular-preview",
      previewSourceKind: "inline-bytes",
      editCapability: "plain-text",
    });

    expect(resolveFileRenderProfile("docs/budget.XLSX")).toMatchObject({
      kind: "tabular",
      previewMode: "tabular-preview",
      previewSourceKind: "file-handle",
      editCapability: "read-only",
    });

    expect(resolveFileRenderProfile("docs/legacy.xls")).toMatchObject({
      kind: "tabular",
      previewMode: "tabular-preview",
      previewSourceKind: "file-handle",
      editCapability: "read-only",
    });

    expect(resolveFileRenderProfile("docs/proposal.docx")).toMatchObject({
      kind: "document",
      previewMode: "document-preview",
      previewSourceKind: "extracted-structure",
      editCapability: "read-only",
    });

    expect(resolveFileRenderProfile("docs/proposal.doc")).toMatchObject({
      kind: "document",
      previewMode: "document-preview",
      previewSourceKind: "file-handle",
      fallbackBehavior: "external-open",
      editCapability: "read-only",
    });

    expect(resolveFileRenderProfile("C:\\Repo\\preview\\SHOT.JPEG")).toMatchObject({
      kind: "image",
      previewMode: "image-preview",
      normalizedLookupPath: "C:/Repo/preview/SHOT.JPEG",
      filenameMatchKey: "shot.jpeg",
    });
  });

  it("resolves structured preview kinds with Windows and shell compatibility paths", () => {
    expect(resolveStructuredPreviewKind("C:\\Repo\\Dockerfile.dev")).toBe("dockerfile");
    expect(resolveStructuredPreviewKind("C:\\Repo\\.zshrc")).toBe("shell");
    expect(resolveStructuredPreviewKind("/Users/dev/project/scripts/release.command")).toBe("shell");
    expect(resolveStructuredPreviewKind("docker-compose.yml")).toBeNull();
  });

  it("uses deterministic bytes, line-count, and truncated budgets for low-cost preview fallback", () => {
    const codeProfile = resolveFileRenderProfile("src/main.ts");
    const markdownProfile = resolveFileRenderProfile("README.md");
    const structuredProfile = resolveFileRenderProfile("Dockerfile");

    expect(
      shouldUseLowCostPreview(
        codeProfile,
        measureFilePreviewMetrics("const value = 1;\n".repeat(10), false),
      ),
    ).toBe(false);

    expect(
      shouldUseLowCostPreview(
        codeProfile,
        measureFilePreviewMetrics("a".repeat(200_001), false),
      ),
    ).toBe(true);

    expect(
      shouldUseLowCostPreview(
        markdownProfile,
        measureFilePreviewMetrics("line\n".repeat(5_001), false),
      ),
    ).toBe(true);

    expect(
      shouldUseLowCostPreview(
        structuredProfile,
        measureFilePreviewMetrics("RUN echo hi\n".repeat(3_001), false),
      ),
    ).toBe(true);

    expect(
      shouldUseLowCostPreview(
        markdownProfile,
        measureFilePreviewMetrics("# truncated", true),
      ),
    ).toBe(true);
  });
});
