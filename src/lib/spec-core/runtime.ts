import {
  listExternalSpecTree,
  readExternalSpecFile,
  readWorkspaceFile,
  runSpecCommand,
  runWorkspaceCommand,
  writeExternalSpecFile,
  writeWorkspaceFile,
} from "../../services/tauri";
import type {
  SpecArtifactEntry,
  SpecArtifactSource,
  SpecBootstrapProjectType,
  SpecChangeSummary,
  SpecChangePreflightResult,
  SpecEnvironmentHealth,
  SpecEnvironmentMode,
  SpecGateState,
  SpecHubAction,
  SpecHubActionKey,
  SpecProjectInfoInput,
  SpecProvider,
  SpecSupportLevel,
  SpecTaskChecklistItem,
  SpecTaskPriority,
  SpecTimelineEvent,
  SpecValidationIssue,
  SpecVerifyState,
  SpecWorkspaceSnapshot,
} from "./types";
import { normalizeSpecRootInput } from "./pathUtils";

const DEFAULT_SPEC_ROOT_RELATIVE = "openspec";

function asPathSet(paths: string[]) {
  return new Set(paths.filter(Boolean));
}

function hasPrefix(value: string, prefix: string) {
  return value === prefix || value.startsWith(`${prefix}/`);
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function toNonEmpty(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "N/A";
}

function normalizeCustomSpecRoot(path: string | null | undefined) {
  return normalizeSpecRootInput(path);
}

function parseProjectInfoHistory(content: string) {
  const marker = "## Update History";
  const markerIndex = content.indexOf(marker);
  if (markerIndex < 0) {
    return [] as string[];
  }
  return content
    .slice(markerIndex + marker.length)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
}

function parseSection(content: string, title: string) {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`##\\s+${escapedTitle}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i");
  const matched = content.match(pattern);
  if (!matched?.[1]) {
    return "";
  }
  return matched[1].trim();
}

function normalizeSectionValue(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized === "N/A") {
    return "";
  }
  return normalized;
}

function buildProjectInfoMarkdown(input: SpecProjectInfoInput, history: string[]) {
  const now = new Date().toISOString();
  const keyCommandsLines = toNonEmpty(input.keyCommands)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- ${line}`);
  const renderedCommands = keyCommandsLines.length > 0 ? keyCommandsLines.join("\n") : "- N/A";
  const renderedHistory = history.length > 0 ? history.join("\n") : `- ${now} Project context initialized`;

  return [
    "# Project Context",
    "",
    `- Type: ${input.projectType === "legacy" ? "Legacy Project" : "New Project"}`,
    `- Updated At: ${now}`,
    "",
    "## Domain",
    toNonEmpty(input.domain),
    "",
    "## Architecture",
    toNonEmpty(input.architecture),
    "",
    "## Constraints",
    toNonEmpty(input.constraints),
    "",
    "## Key Commands",
    renderedCommands,
    "",
    "## Owners",
    toNonEmpty(input.owners),
    "",
    "## Update History",
    renderedHistory,
    "",
  ].join("\n");
}

function parseDateHintFromChangeId(changeId: string) {
  const candidates = changeId.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  let latest = 0;
  for (const candidate of candidates) {
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed) && parsed > latest) {
      latest = parsed;
    }
  }
  return latest;
}

function detectTaskPriority(text: string): SpecTaskPriority {
  const matched = text.match(/\[(P[0-2])\]/i);
  if (!matched?.[1]) {
    return null;
  }
  return matched[1].toLowerCase() as SpecTaskPriority;
}

function parseTaskChecklist(tasksContent: string): SpecTaskChecklistItem[] {
  const lines = tasksContent.split(/\r?\n/);
  const checklist: SpecTaskChecklistItem[] = [];
  let index = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const match = line.match(/^(\s*)[-*+]\s*\[([xX ])\]\s*(.*)$/);
    if (!match) {
      continue;
    }
    const indent = (match[1] ?? "").replace(/\t/g, "  ").length;
    const checked = (match[2] ?? " ").toLowerCase() === "x";
    const text = (match[3] ?? "").trim();

    checklist.push({
      index,
      lineNumber: lineIndex + 1,
      indent,
      checked,
      text,
      priority: detectTaskPriority(text),
    });
    index += 1;
  }

  return checklist;
}

function summarizeTaskProgress(checklist: SpecTaskChecklistItem[]) {
  const requiredTasks = checklist.filter((item) => item.priority !== "p2");
  const checked = checklist.filter((item) => item.checked).length;
  const requiredChecked = requiredTasks.filter((item) => item.checked).length;

  return {
    total: checklist.length,
    checked,
    requiredTotal: requiredTasks.length,
    requiredChecked,
  };
}

function parseTaskProgress(tasksContent: string) {
  const checklist = parseTaskChecklist(tasksContent);
  return {
    checklist,
    progress: summarizeTaskProgress(checklist),
  };
}

type SpecDeltaRequirementOperation = "ADDED" | "MODIFIED" | "REMOVED" | "RENAMED";

const REQUIRE_EXISTING_TARGET_OPERATIONS = new Set<SpecDeltaRequirementOperation>([
  "MODIFIED",
  "REMOVED",
  "RENAMED",
]);

const DELTA_OPERATION_SEQUENCE: SpecDeltaRequirementOperation[] = [
  "ADDED",
  "MODIFIED",
  "REMOVED",
  "RENAMED",
];

function parseDeltaRequirementOperations(content: string): Set<SpecDeltaRequirementOperation> {
  const operations = new Set<SpecDeltaRequirementOperation>();
  const matcher = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\b/gim;
  let matched = matcher.exec(content);
  while (matched) {
    const operation = matched[1]?.toUpperCase() as SpecDeltaRequirementOperation | undefined;
    if (operation) {
      operations.add(operation);
    }
    matched = matcher.exec(content);
  }
  return operations;
}

function normalizeRequirementTitle(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function parseRequirementTitles(content: string) {
  const titles = new Set<string>();
  const matcher = /^###\s+Requirement:\s*(.+?)\s*$/gim;
  let matched = matcher.exec(content);
  while (matched) {
    const normalized = normalizeRequirementTitle(matched[1] ?? "");
    if (normalized) {
      titles.add(normalized);
    }
    matched = matcher.exec(content);
  }
  return titles;
}

function parseDeltaRequirementTitlesByOperation(content: string) {
  const grouped = new Map<SpecDeltaRequirementOperation, string[]>();
  let activeOperation: SpecDeltaRequirementOperation | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const sectionMatched = line.match(/^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/i);
    if (sectionMatched?.[1]) {
      const normalized = sectionMatched[1].toUpperCase() as SpecDeltaRequirementOperation;
      activeOperation = DELTA_OPERATION_SEQUENCE.includes(normalized) ? normalized : null;
      continue;
    }

    if (!activeOperation) {
      continue;
    }

    const requirementMatched = line.match(/^###\s+Requirement:\s*(.+?)\s*$/i);
    if (!requirementMatched?.[1]) {
      continue;
    }
    const title = normalizeRequirementTitle(requirementMatched[1]);
    if (!title) {
      continue;
    }

    const current = grouped.get(activeOperation) ?? [];
    current.push(title);
    grouped.set(activeOperation, current);
  }

  return grouped;
}

function toTargetSpecPath(base: string, deltaSpecPath: string) {
  const prefix = `${base}/specs/`;
  if (!deltaSpecPath.startsWith(prefix)) {
    return null;
  }
  const suffix = deltaSpecPath.slice(prefix.length).trim();
  if (!suffix) {
    return null;
  }
  return `openspec/specs/${suffix}`;
}

async function collectArchivePreflightBlockers(input: {
  workspaceId: string;
  base: string;
  specPaths: string[];
  files: Set<string>;
  customSpecRoot?: string | null;
}) {
  const blockers = new Set<string>();

  await Promise.all(
    input.specPaths.map(async (deltaSpecPath) => {
      const targetSpecPath = toTargetSpecPath(input.base, deltaSpecPath);
      if (!targetSpecPath) {
        return;
      }

      const deltaResponse = await readOptionalWorkspaceFile(
        input.workspaceId,
        deltaSpecPath,
        input.customSpecRoot,
      );
      if (!deltaResponse.exists) {
        return;
      }

      const operations = [...parseDeltaRequirementOperations(deltaResponse.content)].filter((operation) =>
        REQUIRE_EXISTING_TARGET_OPERATIONS.has(operation),
      );
      if (operations.length === 0) {
        return;
      }
      const requirementTitlesByOperation = parseDeltaRequirementTitlesByOperation(deltaResponse.content);

      if (!input.files.has(targetSpecPath)) {
        blockers.add(
          `Archive preflight failed: delta ${operations.join("/")} requires existing ${targetSpecPath}`,
        );
        return;
      }

      const targetResponse = await readOptionalWorkspaceFile(
        input.workspaceId,
        targetSpecPath,
        input.customSpecRoot,
      );
      if (!targetResponse.exists) {
        blockers.add(
          `Archive preflight failed: delta ${operations.join("/")} requires existing ${targetSpecPath}`,
        );
        return;
      }

      const targetTitles = parseRequirementTitles(targetResponse.content);
      for (const operation of operations) {
        const titles = requirementTitlesByOperation.get(operation) ?? [];
        for (const title of titles) {
          const normalizedTitle = normalizeRequirementTitle(title);
          if (!targetTitles.has(normalizedTitle)) {
            blockers.add(
              `Archive preflight failed: delta ${operation} requirement missing in ${targetSpecPath} -> ${normalizedTitle}`,
            );
          }
        }
      }
    }),
  );

  return [...blockers].sort((a, b) => a.localeCompare(b));
}

function derivePreflightHints(blockers: string[]) {
  const hints = new Set<string>();
  for (const blocker of blockers) {
    if (/delta\s+[A-Z/]+\s+requires existing/i.test(blocker)) {
      hints.add("Create the missing target spec under openspec/specs or switch delta operation to ADDED.");
      continue;
    }
    if (/delta\s+[A-Z]+\s+requirement missing in/i.test(blocker)) {
      hints.add("Align MODIFIED/REMOVED/RENAMED requirement title with target spec header exactly.");
      hints.add("If target requirement does not exist, change operation to ADDED.");
    }
  }
  return [...hints];
}

function deriveAffectedSpecs(blockers: string[]) {
  const specs = new Set<string>();
  for (const blocker of blockers) {
    const matched = blocker.match(/(openspec[\\/]+specs[\\/]+.+?\.md)\b/i);
    if (matched?.[1]) {
      specs.add(matched[1].replace(/\\/g, "/"));
    }
  }
  return [...specs].sort((a, b) => a.localeCompare(b));
}

export async function evaluateOpenSpecChangePreflight(input: {
  workspaceId: string;
  changeId: string;
  files: string[];
  customSpecRoot?: string | null;
}): Promise<SpecChangePreflightResult> {
  const base = `openspec/changes/${input.changeId}`;
  const fileSet = asPathSet(input.files);
  const specPaths = input.files
    .filter((entry) => hasPrefix(entry, `${base}/specs`) && entry.endsWith(".md"))
    .sort();

  const blockers = await collectArchivePreflightBlockers({
    workspaceId: input.workspaceId,
    base,
    specPaths,
    files: fileSet,
    customSpecRoot: input.customSpecRoot,
  });
  return {
    blockers,
    hints: derivePreflightHints(blockers),
    affectedSpecs: deriveAffectedSpecs(blockers),
  };
}

function defaultModeForProvider(provider: SpecProvider): SpecEnvironmentMode {
  return provider === "openspec" ? "managed" : "byo";
}

function detectProvider(files: Set<string>, directories: Set<string>) {
  const hasOpenSpec =
    [...directories].some((entry) => hasPrefix(entry, "openspec/changes")) ||
    [...files].some((entry) => hasPrefix(entry, "openspec/changes"));
  if (hasOpenSpec) {
    return { provider: "openspec" as const, supportLevel: "full" as const };
  }

  const hasSpecKit =
    [...directories].some((entry) => hasPrefix(entry, ".specify")) ||
    [...files].some(
      (entry) =>
        hasPrefix(entry, ".specify") ||
        entry === "specify.md" ||
        entry === "specify.yaml" ||
        entry === "spec-kit.md",
    );

  if (hasSpecKit) {
    return { provider: "speckit" as const, supportLevel: "minimal" as const };
  }

  return { provider: "unknown" as const, supportLevel: "none" as const };
}

function collectOpenSpecChanges(files: Set<string>, directories: Set<string>) {
  const active = new Set<string>();
  const archived = new Set<string>();

  const collect = (value: string) => {
    if (!hasPrefix(value, "openspec/changes")) {
      return;
    }
    const rest = value.slice("openspec/changes/".length);
    const [head, second] = rest.split("/");
    if (!head) {
      return;
    }
    if (head === "archive") {
      if (second) {
        archived.add(second.trim());
      }
      return;
    }
    active.add(head.trim());
  };

  directories.forEach(collect);
  files.forEach(collect);

  return {
    active: [...active].sort((a, b) => a.localeCompare(b)),
    archived: [...archived].sort((a, b) => a.localeCompare(b)),
  };
}

function firstExistingPath(files: Set<string>, candidates: string[]) {
  for (const candidate of candidates) {
    if (files.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function collectSpecKitChange(files: Set<string>): SpecChangeSummary | null {
  const proposalPath = firstExistingPath(files, [
    "specify.md",
    "spec-kit.md",
    ".specify/proposal.md",
    ".specify/spec.md",
  ]);
  const designPath = firstExistingPath(files, [
    ".specify/design.md",
    ".specify/architecture.md",
    ".specify/approach.md",
  ]);
  const tasksPath = firstExistingPath(files, [".specify/tasks.md", ".specify/todo.md"]);
  const verificationPath = firstExistingPath(files, [".specify/verification.md"]);
  const specPaths = [...files]
    .filter(
      (entry) =>
        (hasPrefix(entry, ".specify") || hasPrefix(entry, "specs")) &&
        entry.endsWith(".md") &&
        entry !== proposalPath &&
        entry !== designPath &&
        entry !== tasksPath &&
        entry !== verificationPath,
    )
    .sort();

  if (!proposalPath && !designPath && !tasksPath && !verificationPath && specPaths.length === 0) {
    return null;
  }

  const blockers = [
    "Spec-Kit uses minimal compatibility mode (read-only + passthrough).",
  ];

  return {
    id: "spec-kit-workspace",
    status: "blocked",
    updatedAt: Date.now(),
    artifacts: {
      proposalPath,
      designPath,
      tasksPath,
      verificationPath,
      specPaths,
    },
    blockers,
    archiveBlockers: [],
  };
}

async function readOptionalWorkspaceFile(
  workspaceId: string,
  path: string | null,
  customSpecRoot?: string | null,
) {
  if (!path) {
    return { content: "", truncated: false, exists: false };
  }
  try {
    const normalizedSpecRoot = normalizeCustomSpecRoot(customSpecRoot);
    if (normalizedSpecRoot) {
      const response = await readExternalSpecFile(workspaceId, normalizedSpecRoot, path);
      return {
        content: response.content,
        truncated: response.truncated,
        exists: response.exists,
      };
    }
    const response = await readWorkspaceFile(workspaceId, path);
    return {
      content: response.content,
      truncated: response.truncated,
      exists: true,
    };
  } catch {
    return { content: "", truncated: false, exists: false };
  }
}

async function summarizeOpenSpecChange(input: {
  workspaceId: string;
  changeId: string;
  files: Set<string>;
  archived?: boolean;
  skipTaskProgressRead?: boolean;
  customSpecRoot?: string | null;
}): Promise<SpecChangeSummary> {
  const base = input.archived
    ? `openspec/changes/archive/${input.changeId}`
    : `openspec/changes/${input.changeId}`;
  const proposalPath = `${base}/proposal.md`;
  const designPath = `${base}/design.md`;
  const tasksPath = `${base}/tasks.md`;
  const verificationPath = `${base}/verification.md`;

  const specPaths = [...input.files]
    .filter((entry) => hasPrefix(entry, `${base}/specs`) && entry.endsWith(".md"))
    .sort();

  const hasProposal = input.files.has(proposalPath);
  const hasDesign = input.files.has(designPath);
  const hasTasks = input.files.has(tasksPath);
  const hasVerification = input.files.has(verificationPath);
  const hasSpecs = specPaths.length > 0;
  const archiveBlockers = input.archived
    ? []
    : await collectArchivePreflightBlockers({
        workspaceId: input.workspaceId,
        base,
        specPaths,
        files: input.files,
        customSpecRoot: input.customSpecRoot,
      });

  const blockers: string[] = [];
  if (!hasProposal) blockers.push("Missing proposal.md");
  if (!hasDesign) blockers.push("Missing design.md");
  if (!hasTasks) blockers.push("Missing tasks.md");
  if (!hasSpecs) blockers.push("Missing specs delta");

  let tasksContent = "";
  const shouldReadTaskProgress = hasTasks && !input.skipTaskProgressRead;
  if (shouldReadTaskProgress) {
    const response = await readOptionalWorkspaceFile(
      input.workspaceId,
      tasksPath,
      input.customSpecRoot,
    );
    tasksContent = response.content;
    if (!response.exists) {
      blockers.push("Unable to read tasks.md");
    }
  }

  const { progress } = parseTaskProgress(tasksContent);
  const isComplete = hasProposal && hasDesign && hasTasks && hasSpecs;

  let status: SpecChangeSummary["status"] = "draft";
  if (input.archived) {
    status = "archived";
  } else if (!isComplete) {
    status = blockers.length > 0 ? "blocked" : "draft";
  } else if (
    progress.requiredTotal > 0 &&
    progress.requiredChecked > 0 &&
    progress.requiredChecked < progress.requiredTotal
  ) {
    status = "implementing";
  } else if (
    hasVerification ||
    (progress.requiredTotal > 0 &&
      progress.requiredChecked === progress.requiredTotal &&
      progress.requiredChecked > 0) ||
    (progress.total > 0 && progress.checked === progress.total && progress.checked > 0)
  ) {
    status = "verified";
  } else {
    status = "ready";
  }

  return {
    id: input.changeId,
    status,
    updatedAt: parseDateHintFromChangeId(input.changeId),
    artifacts: {
      proposalPath: hasProposal ? proposalPath : null,
      designPath: hasDesign ? designPath : null,
      tasksPath: hasTasks ? tasksPath : null,
      verificationPath: hasVerification ? verificationPath : null,
      specPaths,
    },
    blockers,
    archiveBlockers,
  };
}

async function runWorkspaceBinary(
  workspaceId: string,
  command: string[],
  timeoutMs = 60_000,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const result = await runWorkspaceCommand(workspaceId, command, timeoutMs);
    return {
      ok: result.success,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runSpecKitProbe(workspaceId: string) {
  const specifyVersion = await runWorkspaceBinary(workspaceId, ["specify", "--version"]);
  if (specifyVersion.ok) {
    return specifyVersion;
  }
  const specKitVersion = await runWorkspaceBinary(workspaceId, ["spec-kit", "--version"]);
  if (specKitVersion.ok) {
    return specKitVersion;
  }
  const specifyHelp = await runWorkspaceBinary(workspaceId, ["specify", "--help"]);
  if (specifyHelp.ok) {
    return {
      ok: true,
      stdout: "specify",
      stderr: "",
    };
  }
  return specKitVersion.stderr ? specKitVersion : specifyVersion;
}

async function readExternalSpecTreeSnapshot(input: {
  workspaceId: string;
  specRoot: string;
}): Promise<
  | {
      ok: true;
      files: Set<string>;
      directories: Set<string>;
    }
  | { ok: false; error: string }
> {
  try {
    const snapshot = await listExternalSpecTree(input.workspaceId, input.specRoot);
    return {
      ok: true,
      files: asPathSet(snapshot.files),
      directories: asPathSet(snapshot.directories),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseProbeValue(stdout: string) {
  const normalized = stdout.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return { value: "-", detail: "not found" };
  }
  const [path, ...rest] = normalized.split(" ");
  return {
    value: rest.length > 0 ? rest.join(" ") : path,
    detail: path,
  };
}

export async function diagnoseSpecEnvironment(input: {
  workspaceId: string;
  provider: SpecProvider;
  mode: SpecEnvironmentMode;
}): Promise<SpecEnvironmentHealth> {
  if (input.provider === "unknown") {
    return {
      mode: input.mode,
      status: "degraded",
      checks: [],
      blockers: ["No supported spec provider detected."],
      hints: ["Open a workspace with OpenSpec or spec-kit structure."],
    };
  }

  const [nodeProbe, openspecProbe, speckitProbe] = await Promise.all([
    runWorkspaceBinary(input.workspaceId, ["node", "-v"]),
    runWorkspaceBinary(input.workspaceId, ["openspec", "--version"]),
    runSpecKitProbe(input.workspaceId),
  ]);

  const nodeParsed = parseProbeValue(nodeProbe.stdout);
  const openspecParsed = parseProbeValue(openspecProbe.stdout);
  const speckitParsed = parseProbeValue(speckitProbe.stdout);

  const checks: SpecEnvironmentHealth["checks"] = [
    {
      key: "node",
      label: "Node.js",
      ok: nodeProbe.ok,
      value: nodeProbe.ok ? nodeParsed.value : "missing",
      detail: nodeProbe.ok ? nodeParsed.detail : nodeProbe.stderr || "node not found",
      required: input.provider === "openspec",
    },
    {
      key: "openspec",
      label: "OpenSpec CLI",
      ok: openspecProbe.ok,
      value: openspecProbe.ok ? openspecParsed.value : "missing",
      detail: openspecProbe.ok ? openspecParsed.detail : openspecProbe.stderr || "openspec not found",
      required: input.provider === "openspec",
    },
    {
      key: "speckit",
      label: "Spec-Kit CLI",
      ok: speckitProbe.ok,
      value: speckitProbe.ok ? speckitParsed.value : "missing",
      detail: speckitProbe.ok ? speckitParsed.detail : speckitProbe.stderr || "spec-kit not found",
      required: false,
    },
  ];

  const blockers: string[] = [];
  const hints: string[] = [];

  for (const check of checks) {
    if (!check.ok && check.required) {
      blockers.push(`${check.label} is required for ${input.provider} workflow.`);
    }
  }

  if (!nodeProbe.ok && input.provider === "openspec") {
    hints.push("Install Node.js 18+ and make sure `node` is available in PATH.");
  }
  if (!openspecProbe.ok) {
    if (input.mode === "managed") {
      hints.push("Managed mode: install OpenSpec CLI, then click Refresh to re-run Doctor.");
      hints.push("Fallback: switch to BYO mode to use your existing environment settings.");
    } else {
      hints.push("BYO mode: expose `openspec` in PATH and verify `openspec --version` works.");
    }
  }
  if (input.provider === "speckit" && !speckitProbe.ok) {
    hints.push("Spec-Kit CLI is optional in minimal mode, but enabling it improves diagnostics.");
  }

  const hasRequiredFailure = checks.some((entry) => entry.required && !entry.ok);
  const hasOptionalFailure = checks.some((entry) => !entry.required && !entry.ok);
  const status: SpecEnvironmentHealth["status"] = hasRequiredFailure
    ? "blocked"
    : hasOptionalFailure
      ? "degraded"
      : "healthy";

  return {
    mode: input.mode,
    status,
    checks,
    blockers,
    hints,
  };
}

export async function buildSpecWorkspaceSnapshot(input: {
  workspaceId: string;
  files: string[];
  directories: string[];
  mode?: SpecEnvironmentMode;
  customSpecRoot?: string | null;
}): Promise<SpecWorkspaceSnapshot> {
  const customSpecRoot = normalizeCustomSpecRoot(input.customSpecRoot);
  let files = asPathSet(input.files);
  let directories = asPathSet(input.directories);
  if (customSpecRoot) {
    const external = await readExternalSpecTreeSnapshot({
      workspaceId: input.workspaceId,
      specRoot: customSpecRoot,
    });
    if (!external.ok) {
      return {
        provider: "unknown",
        supportLevel: "none",
        specRoot: {
          source: "custom",
          path: customSpecRoot,
        },
        environment: {
          mode: input.mode ?? "managed",
          status: "degraded",
          checks: [],
          blockers: [`Custom spec root is unavailable: ${external.error}`],
          hints: [
            "Please choose a valid absolute spec root path or restore default workspace path.",
          ],
        },
        changes: [],
        blockers: [`Custom spec root is unavailable: ${external.error}`],
      };
    }
    files = external.files;
    directories = external.directories;
  }

  const detected = detectProvider(files, directories);
  const mode = input.mode ?? defaultModeForProvider(detected.provider);
  const environment = await diagnoseSpecEnvironment({
    workspaceId: input.workspaceId,
    provider: detected.provider,
    mode,
  });

  if (detected.provider === "unknown") {
    return {
      provider: detected.provider,
      supportLevel: detected.supportLevel,
      specRoot: {
        source: customSpecRoot ? "custom" : "default",
        path: customSpecRoot ?? DEFAULT_SPEC_ROOT_RELATIVE,
      },
      environment,
      changes: [],
      blockers: ["No supported spec workspace detected.", ...environment.blockers],
    };
  }

  if (detected.provider === "speckit") {
    const change = collectSpecKitChange(files);
    return {
      provider: detected.provider,
      supportLevel: detected.supportLevel,
      specRoot: {
        source: customSpecRoot ? "custom" : "default",
        path: customSpecRoot ?? DEFAULT_SPEC_ROOT_RELATIVE,
      },
      environment,
      changes: change ? [change] : [],
      blockers: [
        "Spec-Kit is currently in minimal compatibility mode.",
        ...environment.blockers,
      ],
    };
  }

  const changeIds = collectOpenSpecChanges(files, directories);
  const activeChanges = await Promise.all(
    changeIds.active.map((changeId) =>
      summarizeOpenSpecChange({
        workspaceId: input.workspaceId,
        changeId,
        files,
        customSpecRoot,
      }),
    ),
  );

  const archivedChanges = await Promise.all(
    changeIds.archived.map((changeId) =>
      summarizeOpenSpecChange({
        workspaceId: input.workspaceId,
        changeId,
        files,
        archived: true,
        skipTaskProgressRead: true,
        customSpecRoot,
      }),
    ),
  );

  const changes = [...activeChanges, ...archivedChanges].sort(
    (left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id),
  );

  const blockers = [...environment.blockers];
  if (changes.length === 0) {
    blockers.push("No active changes found under openspec/changes.");
  }

  return {
    provider: detected.provider,
    supportLevel: detected.supportLevel,
    specRoot: {
      source: customSpecRoot ? "custom" : "default",
      path: customSpecRoot ?? DEFAULT_SPEC_ROOT_RELATIVE,
    },
    environment,
    changes,
    blockers,
  };
}

export async function loadSpecArtifacts(input: {
  workspaceId: string;
  change: SpecChangeSummary;
  customSpecRoot?: string | null;
}): Promise<Record<SpecArtifactEntry["type"], SpecArtifactEntry>> {
  const [proposal, design, tasks, verification, specSources] = await Promise.all([
    readOptionalWorkspaceFile(
      input.workspaceId,
      input.change.artifacts.proposalPath,
      input.customSpecRoot,
    ),
    readOptionalWorkspaceFile(
      input.workspaceId,
      input.change.artifacts.designPath,
      input.customSpecRoot,
    ),
    readOptionalWorkspaceFile(
      input.workspaceId,
      input.change.artifacts.tasksPath,
      input.customSpecRoot,
    ),
    readOptionalWorkspaceFile(
      input.workspaceId,
      input.change.artifacts.verificationPath,
      input.customSpecRoot,
    ),
    Promise.all(
      input.change.artifacts.specPaths.map(async (path): Promise<SpecArtifactSource> => {
        const response = await readOptionalWorkspaceFile(input.workspaceId, path, input.customSpecRoot);
        return {
          path,
          content: response.content,
          truncated: response.truncated,
        };
      }),
    ),
  ]);

  const specsTruncated = specSources.some((entry) => entry.truncated);
  const firstSpec = specSources[0] ?? null;
  const { checklist: taskChecklist, progress: taskProgress } = parseTaskProgress(tasks.content);

  return {
    proposal: {
      type: "proposal",
      path: input.change.artifacts.proposalPath,
      exists: proposal.exists,
      content: proposal.content,
      truncated: proposal.truncated,
    },
    design: {
      type: "design",
      path: input.change.artifacts.designPath,
      exists: design.exists,
      content: design.content,
      truncated: design.truncated,
    },
    tasks: {
      type: "tasks",
      path: input.change.artifacts.tasksPath,
      exists: tasks.exists,
      content: tasks.content,
      truncated: tasks.truncated,
      taskChecklist,
      taskProgress,
    },
    verification: {
      type: "verification",
      path: input.change.artifacts.verificationPath,
      exists: verification.exists,
      content: verification.content,
      truncated: verification.truncated,
    },
    specs: {
      type: "specs",
      path: firstSpec?.path ?? null,
      exists: specSources.length > 0,
      content: firstSpec?.content ?? "",
      truncated: specsTruncated,
      sources: specSources,
    },
  };
}

export async function updateSpecTaskChecklist(input: {
  workspaceId: string;
  change: SpecChangeSummary;
  taskIndex: number;
  checked: boolean;
  customSpecRoot?: string | null;
}) {
  const tasksPath = input.change.artifacts.tasksPath;
  if (!tasksPath) {
    throw new Error("tasks.md is required");
  }
  const normalizedSpecRoot = normalizeCustomSpecRoot(input.customSpecRoot);
  const response = await readOptionalWorkspaceFile(input.workspaceId, tasksPath, normalizedSpecRoot);
  if (!response.exists) {
    throw new Error("Unable to read tasks.md");
  }

  const newline = response.content.includes("\r\n") ? "\r\n" : "\n";
  const lines = response.content.split(/\r?\n/);
  let checklistIndex = 0;
  let found = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const match = line.match(/^(\s*[-*+]\s*\[)([xX ])(\].*)$/);
    if (!match) {
      continue;
    }
    if (checklistIndex === input.taskIndex) {
      const currentChecked = (match[2] ?? " ").toLowerCase() === "x";
      if (currentChecked !== input.checked) {
        lines[lineIndex] = `${match[1]}${input.checked ? "x" : " "}${match[3]}`;
      }
      found = true;
      break;
    }
    checklistIndex += 1;
  }

  if (!found) {
    throw new Error("Task checkbox not found");
  }

  const nextContent = lines.join(newline);
  if (nextContent !== response.content) {
    if (normalizedSpecRoot) {
      await writeExternalSpecFile(input.workspaceId, normalizedSpecRoot, tasksPath, nextContent);
    } else {
      await writeWorkspaceFile(input.workspaceId, tasksPath, nextContent);
    }
  }

  const { checklist, progress } = parseTaskProgress(nextContent);
  return {
    path: tasksPath,
    content: nextContent,
    taskChecklist: checklist,
    taskProgress: progress,
  };
}

export async function saveSpecProjectInfo(input: {
  workspaceId: string;
  projectInfo: SpecProjectInfoInput;
  customSpecRoot?: string | null;
}) {
  const path = `${DEFAULT_SPEC_ROOT_RELATIVE}/project.md`;
  const normalizedSpecRoot = normalizeCustomSpecRoot(input.customSpecRoot);
  const previous = await readOptionalWorkspaceFile(input.workspaceId, path, normalizedSpecRoot);
  const previousHistory = previous.exists ? parseProjectInfoHistory(previous.content) : [];
  const summary = toNonEmpty(input.projectInfo.summary ?? "Project context updated");
  const historyEntry = `- ${new Date().toISOString()} ${summary}`;
  const nextHistory = [historyEntry, ...previousHistory].slice(0, 30);
  const markdown = buildProjectInfoMarkdown(input.projectInfo, nextHistory);
  if (normalizedSpecRoot) {
    await writeExternalSpecFile(input.workspaceId, normalizedSpecRoot, path, markdown);
    return { path: `${normalizedSpecRoot}/project.md`, historyEntry };
  }
  await writeWorkspaceFile(input.workspaceId, path, markdown);
  return { path, historyEntry };
}

export async function loadSpecProjectInfo(input: {
  workspaceId: string;
  customSpecRoot?: string | null;
}): Promise<SpecProjectInfoInput | null> {
  const path = `${DEFAULT_SPEC_ROOT_RELATIVE}/project.md`;
  try {
    const normalizedSpecRoot = normalizeCustomSpecRoot(input.customSpecRoot);
    const content = normalizedSpecRoot
      ? (await readExternalSpecFile(input.workspaceId, normalizedSpecRoot, path)).content ?? ""
      : (await readWorkspaceFile(input.workspaceId, path)).content ?? "";
    if (!content.trim()) {
      return null;
    }

    const typeMatch = content.match(/- Type:\s*(.+)$/m);
    const projectType: SpecBootstrapProjectType =
      typeMatch?.[1]?.toLowerCase().includes("new") ? "new" : "legacy";

    const rawCommands = parseSection(content, "Key Commands")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^-+\s*/, ""))
      .filter((line) => line !== "N/A");

    return {
      projectType,
      domain: normalizeSectionValue(parseSection(content, "Domain")),
      architecture: normalizeSectionValue(parseSection(content, "Architecture")),
      constraints: normalizeSectionValue(parseSection(content, "Constraints")),
      keyCommands: rawCommands.join("\n"),
      owners: normalizeSectionValue(parseSection(content, "Owners")),
      summary: "",
    };
  } catch {
    return null;
  }
}

function buildBootstrapCommand(projectType: SpecBootstrapProjectType) {
  const base = "openspec init --tools none";
  return projectType === "legacy" ? `${base} --force` : base;
}

function buildBootstrapCommandArgs(projectType: SpecBootstrapProjectType) {
  const args = ["openspec", "init", "--tools", "none"];
  if (projectType === "legacy") {
    args.push("--force");
  }
  return args;
}

export async function initializeOpenSpecWorkspace(input: {
  workspaceId: string;
  projectInfo: SpecProjectInfoInput;
  customSpecRoot?: string | null;
}): Promise<SpecTimelineEvent> {
  const command = buildBootstrapCommand(input.projectInfo.projectType);
  const normalizedSpecRoot = normalizeCustomSpecRoot(input.customSpecRoot);
  const commandArgs = buildBootstrapCommandArgs(input.projectInfo.projectType);
  const result = await runSpecCommand(
    input.workspaceId,
    commandArgs,
    {
      customSpecRoot: normalizedSpecRoot,
      timeoutMs: 180_000,
    },
  );

  const outputParts = [result.stdout, result.stderr].filter(Boolean);
  if (!result.success) {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      kind: "action",
      action: "bootstrap",
      command,
      success: false,
      output: outputParts.join("\n").trim(),
      validationIssues: [],
      gitRefs: [],
    };
  }

  try {
    const saved = await saveSpecProjectInfo({
      workspaceId: input.workspaceId,
      projectInfo: {
        ...input.projectInfo,
        summary: input.projectInfo.summary?.trim() || "Bootstrap initialized",
      },
      customSpecRoot: normalizedSpecRoot,
    });
    outputParts.push(`Project context saved: ${saved.path}`);
  } catch (error) {
    outputParts.push(
      `Project context save failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      kind: "action",
      action: "bootstrap",
      command,
      success: false,
      output: outputParts.join("\n").trim(),
      validationIssues: [],
      gitRefs: [],
    };
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    kind: "action",
    action: "bootstrap",
    command,
    success: true,
    output: outputParts.join("\n").trim(),
    validationIssues: [],
    gitRefs: [],
  };
}

function buildActionCommand(changeId: string, action: SpecHubActionKey, provider: SpecProvider) {
  const quotedId = shellQuote(changeId);
  if (provider === "speckit") {
    switch (action) {
      case "continue":
        return "specify propose --help";
      case "apply":
        return "specify tasks --help";
      case "verify":
        return "specify check --help";
      case "archive":
        return "specify archive --help";
      case "bootstrap":
        return "specify --help";
      default:
        return "specify --help";
    }
  }

  switch (action) {
    case "continue":
      return `openspec instructions specs --change ${quotedId}`;
    case "apply":
      return `openspec instructions tasks --change ${quotedId}`;
    case "verify":
      return `openspec validate ${quotedId} --strict`;
    case "archive":
      return `openspec archive ${quotedId} --yes`;
    case "bootstrap":
      return "openspec init --tools none";
    default:
      return "";
  }
}

function buildActionCommandArgs(changeId: string, action: SpecHubActionKey, provider: SpecProvider) {
  if (provider === "speckit") {
    switch (action) {
      case "continue":
        return ["specify", "propose", "--help"];
      case "apply":
        return ["specify", "tasks", "--help"];
      case "verify":
        return ["specify", "check", "--help"];
      case "archive":
        return ["specify", "archive", "--help"];
      case "bootstrap":
        return ["specify", "--help"];
      default:
        return ["specify", "--help"];
    }
  }

  switch (action) {
    case "continue":
      return ["openspec", "instructions", "specs", "--change", changeId];
    case "apply":
      return ["openspec", "instructions", "tasks", "--change", changeId];
    case "verify":
      return ["openspec", "validate", changeId, "--strict"];
    case "archive":
      return ["openspec", "archive", changeId, "--yes"];
    case "bootstrap":
      return ["openspec", "init", "--tools", "none"];
    default:
      return [];
  }
}

export function buildSpecActions(input: {
  change: SpecChangeSummary;
  supportLevel: SpecSupportLevel;
  provider: SpecProvider;
  environment: SpecEnvironmentHealth;
  verifyState?: SpecVerifyState;
  taskProgress?: SpecArtifactEntry["taskProgress"];
}): SpecHubAction[] {
  const isArchived = input.change.status === "archived";
  const supported = input.supportLevel === "full" && input.provider === "openspec";
  const sharedBlockers: string[] = [];
  const verifyState = input.verifyState ?? { ran: false, success: false };

  if (input.environment.status === "blocked") {
    sharedBlockers.push(...input.environment.blockers);
  }
  if (!supported) {
    sharedBlockers.push("This provider is running in minimal compatibility mode.");
  }
  if (isArchived) {
    sharedBlockers.push("Change is already archived");
  }

  const CONTINUE_IGNORE_BLOCKERS = new Set([
    "Missing design.md",
    "Missing tasks.md",
    "Missing specs delta",
    "Unable to read tasks.md",
  ]);
  const APPLY_IGNORE_BLOCKERS = new Set([
    "Missing design.md",
    "Missing tasks.md",
    "Unable to read tasks.md",
  ]);
  const continueChangeBlockers = input.change.blockers.filter(
    (blocker) => !CONTINUE_IGNORE_BLOCKERS.has(blocker),
  );
  const applyChangeBlockers = input.change.blockers.filter(
    (blocker) => !APPLY_IGNORE_BLOCKERS.has(blocker),
  );
  const applyGateBlockers: string[] = [];
  if (input.change.artifacts.specPaths.length === 0) {
    applyGateBlockers.push("Run continue first to generate specs delta");
  }

  const incompleteForVerify = !(
    input.change.artifacts.proposalPath &&
    input.change.artifacts.designPath &&
    input.change.artifacts.tasksPath &&
    input.change.artifacts.specPaths.length > 0
  );
  const hasRequiredTasks = (input.taskProgress?.requiredTotal ?? 0) > 0;
  const requiredTasksDone =
    !hasRequiredTasks ||
    (input.taskProgress?.requiredChecked ?? 0) >= (input.taskProgress?.requiredTotal ?? 0);
  const archiveGateBlockers: string[] = [];
  if (!isArchived) {
    if (!verifyState.ran || !verifyState.success) {
      archiveGateBlockers.push("Strict verify must pass before archive");
    }
    if (!requiredTasksDone) {
      archiveGateBlockers.push("Required tasks are incomplete");
    }
  }

  const actionMeta: Array<{ key: SpecHubActionKey; label: string; blockers: string[] }> = [
    {
      key: "continue",
      label: "Continue",
      blockers: continueChangeBlockers,
    },
    {
      key: "apply",
      label: "Apply",
      blockers: [...applyChangeBlockers, ...applyGateBlockers],
    },
    {
      key: "verify",
      label: "Verify",
      blockers: [
        ...input.change.blockers,
        ...(incompleteForVerify ? ["Core artifacts are incomplete"] : []),
      ],
    },
    {
      key: "archive",
      label: "Archive",
      blockers: [...input.change.blockers, ...archiveGateBlockers],
    },
  ];

  return actionMeta.map((entry) => {
    const blockers = [...new Set([...sharedBlockers, ...entry.blockers])];
    return {
      key: entry.key,
      label: entry.label,
      commandPreview: buildActionCommand(input.change.id, entry.key, input.provider),
      available: blockers.length === 0 && supported,
      blockers,
      kind: supported ? "native" : "passthrough",
    };
  });
}

function parseValidationIssues(output: string): SpecValidationIssue[] {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const issues: SpecValidationIssue[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (!/(error|failed|invalid|missing|required|not found)/i.test(line)) {
      continue;
    }

    const pathMatch = line.match(/([\w./-]+\.md(?::\d+)?)/i);
    const path = pathMatch?.[1] ?? null;
    const target = path ?? "validation";
    const reason = line;
    const hint = path
      ? "Open the target file and fix the requirement mismatch before re-running verify."
      : "Read command output and complete missing artifacts, then run verify again.";

    const key = `${target}|${reason}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    issues.push({
      target,
      reason,
      hint,
      path,
    });
  }

  return issues.slice(0, 24);
}

function extractGitRefs(output: string) {
  const refs = output.match(/\b[0-9a-f]{7,40}\b/gi) ?? [];
  return [...new Set(refs.map((entry) => entry.toLowerCase()))].slice(0, 8);
}

function hasSemanticActionFailure(action: SpecHubActionKey, output: string) {
  const normalized = output.toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes("aborted. no files were changed")) {
    return true;
  }
  if (action === "archive" && normalized.includes("failed for header")) {
    return true;
  }
  return false;
}

export async function runSpecAction(input: {
  workspaceId: string;
  changeId: string;
  action: SpecHubActionKey;
  provider: SpecProvider;
  customSpecRoot?: string | null;
}): Promise<SpecTimelineEvent> {
  const command = buildActionCommand(input.changeId, input.action, input.provider);
  const commandArgs = buildActionCommandArgs(input.changeId, input.action, input.provider);
  const normalizedSpecRoot =
    input.provider === "openspec" ? normalizeCustomSpecRoot(input.customSpecRoot) : null;
  const result = await runSpecCommand(
    input.workspaceId,
    commandArgs,
    {
      customSpecRoot: normalizedSpecRoot,
      timeoutMs: 180_000,
    },
  );

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  const validationIssues = input.action === "verify" ? parseValidationIssues(output) : [];
  const success = result.success && !hasSemanticActionFailure(input.action, output);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    kind: input.action === "verify" ? "validate" : "action",
    action: input.action,
    command,
    success,
    output,
    validationIssues,
    gitRefs: extractGitRefs(output),
  };
}

export function buildSpecGateState(input: {
  snapshot: SpecWorkspaceSnapshot;
  selectedChange: SpecChangeSummary | null;
  lastVerifyEvent: SpecTimelineEvent | null;
  verifyState?: SpecVerifyState;
  artifacts?: Record<SpecArtifactEntry["type"], SpecArtifactEntry> | null;
}): SpecGateState {
  const checks: SpecGateState["checks"] = [];

  checks.push({
    key: "provider",
    label: "Provider",
    status: input.snapshot.provider === "unknown" ? "fail" : "pass",
    message:
      input.snapshot.provider === "unknown"
        ? "No supported provider detected"
        : `${input.snapshot.provider} (${input.snapshot.supportLevel})`,
  });

  checks.push({
    key: "health",
    label: "Environment",
    status:
      input.snapshot.environment.status === "healthy"
        ? "pass"
        : input.snapshot.environment.status === "degraded"
          ? "warn"
          : "fail",
    message:
      input.snapshot.environment.status === "healthy"
        ? "Doctor checks passed"
        : input.snapshot.environment.blockers[0] ?? "Environment needs attention",
  });

  if (!input.selectedChange) {
    checks.push({
      key: "artifacts",
      label: "Artifacts",
      status: "warn",
      message: "Select a change first",
    });
  } else {
    const complete =
      Boolean(input.selectedChange.artifacts.proposalPath) &&
      Boolean(input.selectedChange.artifacts.designPath) &&
      Boolean(input.selectedChange.artifacts.tasksPath) &&
      input.selectedChange.artifacts.specPaths.length > 0;
    const hasChangeBlockers = input.selectedChange.blockers.length > 0;
    const truncatedArtifacts: string[] = [];
    if (input.artifacts?.tasks.truncated) {
      truncatedArtifacts.push("tasks.md");
    }
    if (input.artifacts?.specs.truncated) {
      truncatedArtifacts.push("specs");
    }
    const hasTruncatedRisk = truncatedArtifacts.length > 0;
    checks.push({
      key: "artifacts",
      label: "Artifacts",
      status: hasChangeBlockers
        ? "fail"
        : !complete
          ? "fail"
          : hasTruncatedRisk
            ? "warn"
            : "pass",
      message: hasChangeBlockers
        ? input.selectedChange.blockers[0] || "Core artifacts incomplete"
        : !complete
          ? "Core artifacts incomplete"
          : hasTruncatedRisk
            ? `Artifact evidence is truncated (${truncatedArtifacts.join(", ")}). Re-read before archive.`
            : "Core artifacts ready",
    });
  }

  const verifyEvidence =
    input.verifyState ??
    (input.lastVerifyEvent
      ? {
          ran: true,
          success: input.lastVerifyEvent.success,
        }
      : {
          ran: false,
          success: false,
        });

  if (!verifyEvidence.ran) {
    checks.push({
      key: "validation",
      label: "Validation",
      status: input.selectedChange?.status === "archived" ? "pass" : "warn",
      message:
        input.selectedChange?.status === "archived"
          ? "Change is already archived"
          : "No strict verify evidence recorded",
    });
  } else {
    checks.push({
      key: "validation",
      label: "Validation",
      status: verifyEvidence.success ? "pass" : "fail",
      message: verifyEvidence.success
        ? "Latest strict verify passed"
        : input.lastVerifyEvent?.validationIssues[0]?.reason || "Latest strict verify failed",
    });
  }

  const hasFail = checks.some((entry) => entry.status === "fail");
  const hasWarn = checks.some((entry) => entry.status === "warn");

  return {
    status: hasFail ? "fail" : hasWarn ? "warn" : "pass",
    checks,
  };
}
