import { describe, expect, it } from "vitest";
import {
  measureFilePreviewMetrics,
  resolveFileRenderProfile,
} from "./fileRenderProfile";
import {
  resolveDefaultFileViewMode,
  resolveFileViewSurface,
} from "./fileViewSurface";

describe("fileViewSurface", () => {
  it("keeps the fixed sample matrix on one render-profile-driven decision chain", () => {
    const readmeProfile = resolveFileRenderProfile("README.md");
    const dockerfileProfile = resolveFileRenderProfile("Dockerfile");
    const composeProfile = resolveFileRenderProfile("docker-compose.yml");
    const envProfile = resolveFileRenderProfile(".env.local");
    const gradleProfile = resolveFileRenderProfile("build.gradle.kts");
    const pdfProfile = resolveFileRenderProfile("docs/report.pdf");
    const csvProfile = resolveFileRenderProfile("docs/report.csv");
    const docxProfile = resolveFileRenderProfile("docs/report.docx");

    expect(resolveDefaultFileViewMode(readmeProfile, "edit")).toBe("preview");
    expect(
      resolveFileViewSurface(
        readmeProfile,
        "preview",
        measureFilePreviewMetrics("# Title", false),
      ),
    ).toEqual({
      kind: "markdown-preview",
      useLowCostPreview: false,
    });

    expect(resolveDefaultFileViewMode(dockerfileProfile, "edit")).toBe("edit");
    expect(
      resolveFileViewSurface(
        dockerfileProfile,
        "preview",
        measureFilePreviewMetrics("FROM node:20-alpine", false),
      ),
    ).toEqual({
      kind: "structured-preview",
      useLowCostPreview: false,
    });

    expect(
      resolveFileViewSurface(
        composeProfile,
        "preview",
        measureFilePreviewMetrics("services:\n  app:\n    image: demo", false),
      ),
    ).toEqual({
      kind: "code-preview",
      useLowCostPreview: false,
    });

    expect(
      resolveFileViewSurface(
        envProfile,
        "edit",
        measureFilePreviewMetrics("# comment\nAPP_ENV=dev", false),
      ),
    ).toEqual({
      kind: "editor",
      useLowCostPreview: false,
    });

    expect(
      resolveFileViewSurface(
        gradleProfile,
        "edit",
        measureFilePreviewMetrics("// comment\nplugins {}", false),
      ),
    ).toEqual({
      kind: "editor",
      useLowCostPreview: false,
    });

    expect(resolveDefaultFileViewMode(pdfProfile, "edit")).toBe("preview");
    expect(
      resolveFileViewSurface(
        pdfProfile,
        "preview",
        measureFilePreviewMetrics("", false),
      ),
    ).toEqual({
      kind: "pdf-preview",
      useLowCostPreview: false,
    });

    expect(resolveDefaultFileViewMode(csvProfile, "edit")).toBe("preview");
    expect(
      resolveFileViewSurface(
        csvProfile,
        "preview",
        measureFilePreviewMetrics("name,value\nalpha,1", false),
      ),
    ).toEqual({
      kind: "tabular-preview",
      useLowCostPreview: false,
    });
    expect(
      resolveFileViewSurface(
        csvProfile,
        "edit",
        measureFilePreviewMetrics("name,value\nalpha,1", false),
      ),
    ).toEqual({
      kind: "editor",
      useLowCostPreview: false,
    });

    expect(resolveDefaultFileViewMode(docxProfile, "edit")).toBe("preview");
    expect(
      resolveFileViewSurface(
        docxProfile,
        "preview",
        measureFilePreviewMetrics("", false),
      ),
    ).toEqual({
      kind: "document-preview",
      useLowCostPreview: false,
    });
  });

  it("keeps low-cost preview fallback on the same decision chain", () => {
    const markdownProfile = resolveFileRenderProfile("README.md");

    expect(
      resolveFileViewSurface(
        markdownProfile,
        "preview",
        measureFilePreviewMetrics("# Title\n" + "body\n".repeat(10), true),
      ),
    ).toEqual({
      kind: "code-preview",
      useLowCostPreview: true,
    });
  });
});
