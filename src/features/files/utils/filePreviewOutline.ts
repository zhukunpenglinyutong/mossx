import type { PDFDocumentProxy } from "pdfjs-dist";

export type PreviewOutlineTarget =
  | { kind: "pdf-page"; pageNumber: number }
  | { kind: "html-anchor"; anchorId: string };

export type PreviewOutlineItem = {
  id: string;
  title: string;
  level: number;
  children: PreviewOutlineItem[];
  target: PreviewOutlineTarget;
};

type DocumentPreviewOutlineResult = {
  html: string;
  outline: PreviewOutlineItem[];
};

type PdfReference = {
  num: number;
  gen: number;
};

function isRefProxy(value: unknown): value is PdfReference {
  if (typeof value !== "object" || value == null) {
    return false;
  }
  const maybeRef = value as { num?: unknown; gen?: unknown };
  return typeof maybeRef.num === "number" && typeof maybeRef.gen === "number";
}

function normalizeOutlineTitle(title: string | null | undefined, fallback: string) {
  const trimmed = title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function normalizePdfPageNumber(pageNumber: number, totalPages: number) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > totalPages) {
    return null;
  }
  return pageNumber;
}

function createUniqueAnchorId(
  usedAnchorIds: Set<string>,
  preferredId: string | null | undefined,
  fallbackId: string,
) {
  const normalizedPreferredId = preferredId?.trim() ?? "";
  if (normalizedPreferredId && !usedAnchorIds.has(normalizedPreferredId)) {
    usedAnchorIds.add(normalizedPreferredId);
    return normalizedPreferredId;
  }

  let nextAnchorId = fallbackId;
  let suffix = 1;
  while (usedAnchorIds.has(nextAnchorId)) {
    nextAnchorId = `${fallbackId}-${suffix}`;
    suffix += 1;
  }
  usedAnchorIds.add(nextAnchorId);
  return nextAnchorId;
}

async function resolvePdfDestinationPageNumber(
  pdfDocument: PDFDocumentProxy,
  destination: string | Array<unknown> | null,
) {
  if (!destination) {
    return null;
  }

  const resolvedDestination = typeof destination === "string"
    ? await pdfDocument.getDestination(destination)
    : destination;

  if (!resolvedDestination || resolvedDestination.length === 0) {
    return null;
  }

  const firstEntry = resolvedDestination[0];
  if (typeof firstEntry === "number" && Number.isFinite(firstEntry)) {
    return normalizePdfPageNumber(firstEntry + 1, pdfDocument.numPages);
  }
  if (!isRefProxy(firstEntry)) {
    return null;
  }

  const pageIndex = await pdfDocument.getPageIndex(firstEntry);
  return normalizePdfPageNumber(pageIndex + 1, pdfDocument.numPages);
}

async function mapPdfOutlineItems(
  pdfDocument: PDFDocumentProxy,
  items: NonNullable<Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>>,
  level: number,
  pathPrefix: string,
  untitledLabel: string,
): Promise<PreviewOutlineItem[]> {
  const mappedItems = await Promise.all(items.map(async (item, index) => {
    const children = await mapPdfOutlineItems(
      pdfDocument,
      item.items ?? [],
      level + 1,
      `${pathPrefix}-${index}`,
      untitledLabel,
    );
    const pageNumber = await resolvePdfDestinationPageNumber(pdfDocument, item.dest);
    const fallbackTarget = children[0]?.target ?? null;

    if (!pageNumber && !fallbackTarget) {
      return null;
    }

    return {
      id: `pdf-outline${pathPrefix}-${index}`,
      title: normalizeOutlineTitle(item.title, `${untitledLabel} ${index + 1}`),
      level,
      children,
      target: pageNumber
        ? { kind: "pdf-page" as const, pageNumber }
        : fallbackTarget!,
    };
  }));

  return mappedItems.filter((item): item is PreviewOutlineItem => item != null);
}

export async function extractPdfPreviewOutline(
  pdfDocument: PDFDocumentProxy,
  untitledLabel: string,
) {
  const outline = await pdfDocument.getOutline();
  if (!outline || outline.length === 0) {
    return [];
  }
  return mapPdfOutlineItems(pdfDocument, outline, 1, "", untitledLabel);
}

export function extractDocumentPreviewOutline(
  html: string,
  untitledLabel: string,
): DocumentPreviewOutlineResult {
  if (typeof DOMParser === "undefined") {
    return {
      html,
      outline: [],
    };
  }

  const parsedDocument = new DOMParser().parseFromString(html, "text/html");
  const headings = Array.from(parsedDocument.body.querySelectorAll("h1,h2,h3,h4,h5,h6"));

  if (headings.length === 0) {
    return {
      html,
      outline: [],
    };
  }

  const rootItems: PreviewOutlineItem[] = [];
  const parentStack: PreviewOutlineItem[] = [];
  const usedAnchorIds = new Set<string>();

  headings.forEach((headingNode, index) => {
    const level = Number(headingNode.tagName.slice(1));
    const anchorId = createUniqueAnchorId(
      usedAnchorIds,
      headingNode.id,
      `file-preview-heading-${index}`,
    );
    const title = normalizeOutlineTitle(
      headingNode.textContent,
      `${untitledLabel} ${index + 1}`,
    );

    headingNode.id = anchorId;

    const nextItem: PreviewOutlineItem = {
      id: anchorId,
      title,
      level,
      children: [],
      target: {
        kind: "html-anchor",
        anchorId,
      },
    };

    while (parentStack.length > 0 && parentStack[parentStack.length - 1]!.level >= level) {
      parentStack.pop();
    }

    const parentItem = parentStack[parentStack.length - 1];
    if (parentItem) {
      parentItem.children.push(nextItem);
    } else {
      rootItems.push(nextItem);
    }

    parentStack.push(nextItem);
  });

  return {
    html: parsedDocument.body.innerHTML,
    outline: rootItems,
  };
}
