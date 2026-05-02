import type { DetachedSpecHubArtifactType, DetachedSpecHubSession } from "../../../detachedSpecHub";

export type SpecHubOutlineItem = {
  id: string;
  title: string;
  level: number;
  kind: "heading" | "requirement" | "scenario";
};

export type SpecHubDomSnapshot = {
  selectedChangeId: string | null;
  artifactType: DetachedSpecHubArtifactType | null;
  artifactPath: string | null;
  specSourcePath: string | null;
  artifactMaximized: boolean;
  controlCollapsed: boolean;
  outline: SpecHubOutlineItem[];
  pendingOutlineIds: string[];
  proposalCapabilities: string[];
};

const ARTIFACT_ORDER: DetachedSpecHubArtifactType[] = [
  "proposal",
  "design",
  "specs",
  "tasks",
  "verification",
];

function normalizeText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "section";
}

function ensureElementAnchor(
  element: Element,
  title: string,
  index: number,
  usedIds: Set<string>,
) {
  const htmlElement = element as HTMLElement;
  const existing = normalizeText(htmlElement.id);
  if (existing) {
    usedIds.add(existing);
    return existing;
  }
  const base = `spec-hub-reader-${slugify(title)}-${index}`;
  let nextId = base;
  let suffix = 1;
  while (usedIds.has(nextId)) {
    nextId = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(nextId);
  htmlElement.id = nextId;
  return nextId;
}

function readHeadingLevel(element: Element) {
  if (/^H[1-6]$/.test(element.tagName)) {
    return Number(element.tagName.slice(1));
  }
  const className = (element as HTMLElement).className;
  const match = className.match(/level-(\d)/);
  return match ? Number(match[1]) : 2;
}

function inferKind(title: string): SpecHubOutlineItem["kind"] {
  if (/^Requirement:\s*/i.test(title)) {
    return "requirement";
  }
  if (/^Scenario:\s*/i.test(title)) {
    return "scenario";
  }
  return "heading";
}

export function inferArtifactTypeFromPath(path: string | null): DetachedSpecHubArtifactType | null {
  const normalized = normalizeText(path).toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.endsWith("/proposal.md")) {
    return "proposal";
  }
  if (normalized.endsWith("/design.md")) {
    return "design";
  }
  if (normalized.endsWith("/tasks.md")) {
    return "tasks";
  }
  if (normalized.endsWith("/verification.md")) {
    return "verification";
  }
  if (normalized.endsWith("/spec.md") || normalized.includes("/specs/")) {
    return "specs";
  }
  return null;
}

function inferArtifactTypeFromActiveTabs(root: HTMLElement): DetachedSpecHubArtifactType | null {
  const tabs = Array.from(
    root.querySelectorAll(".spec-hub-tabs [role='tab']"),
  );
  const selectedIndex = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
  return selectedIndex >= 0 ? ARTIFACT_ORDER[selectedIndex] ?? null : null;
}

function collectOutline(root: HTMLElement): SpecHubOutlineItem[] {
  const artifactBody = root.querySelector(".spec-hub-artifact-body");
  if (!(artifactBody instanceof HTMLElement)) {
    return [];
  }
  const headingElements = Array.from(
    artifactBody.querySelectorAll(
      ".spec-hub-markdown h1, .spec-hub-markdown h2, .spec-hub-markdown h3, .spec-hub-markdown h4, .spec-hub-markdown h5, .spec-hub-markdown h6, .spec-hub-task-heading",
    ),
  );
  const usedIds = new Set<string>();
  return headingElements
    .map((element, index) => {
      const title = normalizeText(element.textContent);
      if (!title) {
        return null;
      }
      return {
        id: ensureElementAnchor(element, title, index, usedIds),
        title,
        level: readHeadingLevel(element),
        kind: inferKind(title),
      } satisfies SpecHubOutlineItem;
    })
    .filter((entry): entry is SpecHubOutlineItem => entry !== null);
}

function collectProposalCapabilities(root: HTMLElement) {
  const artifactBody = root.querySelector(".spec-hub-artifact-body");
  if (!(artifactBody instanceof HTMLElement)) {
    return [];
  }
  const values = Array.from(artifactBody.querySelectorAll(".spec-hub-markdown code"))
    .map((node) => normalizeText(node.textContent))
    .filter((entry) => /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(entry));
  return Array.from(new Set(values));
}

function collectPendingOutlineIds(
  root: HTMLElement,
  artifactType: DetachedSpecHubArtifactType | null,
  outline: SpecHubOutlineItem[],
) {
  if (artifactType !== "tasks" || outline.length === 0) {
    return [];
  }
  const artifactBody = root.querySelector(".spec-hub-artifact-body");
  if (!(artifactBody instanceof HTMLElement)) {
    return [];
  }

  const fallbackOutlineId = outline[0]?.id ?? null;
  let currentHeadingId = fallbackOutlineId;
  const pendingIds = new Set<string>();
  const nodes = Array.from(
    artifactBody.querySelectorAll(".spec-hub-task-heading, .spec-hub-task-checkbox"),
  );

  for (const node of nodes) {
    if (node instanceof HTMLElement && node.classList.contains("spec-hub-task-heading")) {
      currentHeadingId = normalizeText(node.id) || currentHeadingId;
      continue;
    }
    if (
      node instanceof HTMLInputElement &&
      node.classList.contains("spec-hub-task-checkbox") &&
      !node.checked &&
      currentHeadingId
    ) {
      pendingIds.add(currentHeadingId);
    }
  }

  return outline.filter((item) => pendingIds.has(item.id)).map((item) => item.id);
}

export function readSpecHubDomSnapshot(root: HTMLElement): SpecHubDomSnapshot {
  const grid = root.querySelector(".spec-hub-grid");
  const selectedChangeId = normalizeText(
    root.querySelector(".spec-hub-change-item.is-active .spec-hub-change-id")?.textContent,
  ) || null;
  const artifactPath = normalizeText(
    root.querySelector(".spec-hub-artifact-path")?.textContent,
  ) || null;
  const artifactType =
    inferArtifactTypeFromPath(artifactPath) ?? inferArtifactTypeFromActiveTabs(root);
  const specSourcePath =
    normalizeText(
      root.querySelector(".spec-hub-spec-file-chip.is-active")?.getAttribute("title") ??
        root.querySelector(".spec-hub-spec-file-chip.is-active")?.textContent,
    ) || null;
  const outline = collectOutline(root);

  return {
    selectedChangeId,
    artifactType,
    artifactPath,
    specSourcePath,
    artifactMaximized: grid?.classList.contains("is-artifact-maximized") ?? false,
    controlCollapsed: grid?.classList.contains("is-control-collapsed") ?? false,
    outline,
    pendingOutlineIds: collectPendingOutlineIds(root, artifactType, outline),
    proposalCapabilities: artifactType === "proposal" ? collectProposalCapabilities(root) : [],
  };
}

function clickElement(element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  return true;
}

export function selectChangeRow(root: HTMLElement, changeId: string) {
  const changeRows = Array.from(root.querySelectorAll(".spec-hub-change-item"));
  const target = changeRows.find(
    (row) =>
      normalizeText(row.querySelector(".spec-hub-change-id")?.textContent) === changeId,
  );
  return clickElement(target ?? null);
}

export function selectArtifactTab(root: HTMLElement, artifactType: DetachedSpecHubArtifactType) {
  const tabs = Array.from(root.querySelectorAll(".spec-hub-tabs [role='tab']"));
  const index = ARTIFACT_ORDER.indexOf(artifactType);
  if (index < 0) {
    return false;
  }
  return clickElement(tabs[index] ?? null);
}

function readChipLabel(element: Element) {
  return normalizeText(
    element.getAttribute("title") ??
      element.textContent,
  );
}

export function selectSpecSourcePath(root: HTMLElement, specSourcePath: string) {
  const normalizedTarget = normalizeText(specSourcePath);
  const chips = Array.from(root.querySelectorAll(".spec-hub-spec-file-chip"));
  const chip = chips.find((entry) => readChipLabel(entry) === normalizedTarget);
  return clickElement(chip ?? null);
}

export function selectSpecSourceByCapability(root: HTMLElement, capabilityId: string) {
  const normalizedTarget = normalizeText(capabilityId);
  const chips = Array.from(root.querySelectorAll(".spec-hub-spec-file-chip"));
  const chip = chips.find((entry) => readChipLabel(entry).includes(normalizedTarget));
  return clickElement(chip ?? null);
}

export function scrollToOutlineItem(root: HTMLElement, item: SpecHubOutlineItem) {
  const escapeId =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(item.id)
      : item.id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  const target = root.querySelector<HTMLElement>(`#${escapeId}`);
  if (!target) {
    return false;
  }
  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  return true;
}

export function applyDetachedReaderSession(root: HTMLElement, session: DetachedSpecHubSession) {
  const snapshot = readSpecHubDomSnapshot(root);
  if (session.changeId && snapshot.selectedChangeId !== session.changeId) {
    return selectChangeRow(root, session.changeId);
  }
  if (session.artifactType && snapshot.artifactType !== session.artifactType) {
    return selectArtifactTab(root, session.artifactType);
  }
  if (session.specSourcePath && snapshot.specSourcePath !== session.specSourcePath) {
    return selectSpecSourcePath(root, session.specSourcePath);
  }
  return false;
}
