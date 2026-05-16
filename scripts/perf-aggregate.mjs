import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const schemaVersion = "1.0";
const fragmentPaths = [
  "docs/perf/long-list-baseline.json",
  "docs/perf/composer-baseline.json",
  "docs/perf/realtime-extended-baseline.json",
  "docs/perf/cold-start-baseline.json",
];

async function readJson(path) {
  return JSON.parse(await readFile(resolve(process.cwd(), path), "utf-8"));
}

async function writeText(path, value) {
  const absolutePath = resolve(process.cwd(), path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, value, "utf-8");
}

function formatValue(value) {
  return value == null ? "unsupported" : String(value);
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function resolveArchivePath(version, extension) {
  const base = `docs/perf/history/v${version}-baseline.${extension}`;
  if (!existsSync(resolve(process.cwd(), base))) {
    return base;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `docs/perf/history/v${version}-baseline-${timestamp}.${extension}`;
}

function getGitValue(args, fallback) {
  try {
    return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf-8" }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function createMarkdown(report) {
  const lines = [
    `# v${report.version} Performance Baseline`,
    "",
    `Generated at: ${report.generatedAt}`,
    `Schema version: ${report.schemaVersion}`,
    `Branch: ${report.git.branch}`,
    `Commit: ${report.git.commit}`,
    "",
    "## Section A — Fixture-Replay Baseline",
    "",
    "| Scenario | Metric | Value | Unit | Notes |",
    "|---|---:|---:|---|---|",
  ];
  for (const metric of report.metrics) {
    lines.push(`| ${escapeMarkdownCell(metric.scenario)} | ${escapeMarkdownCell(metric.metric)} | ${escapeMarkdownCell(formatValue(metric.value))} | ${escapeMarkdownCell(metric.unit)} | ${escapeMarkdownCell(metric.notes ?? metric.unsupportedReason ?? "")} |`);
  }
  lines.push("", "## Section B — Cross-Platform Notes", "");
  const skips = report.metrics.filter((metric) => metric.value == null && metric.unsupportedReason);
  if (skips.length === 0) {
    lines.push("- No platform skips recorded.");
  } else {
    for (const metric of skips) {
      lines.push(`- ${process.platform}: ${metric.scenario}/${metric.metric} unsupported - ${metric.unsupportedReason}`);
    }
  }
  lines.push("", "## Section C — Residual Risks", "");
  if (report.residualRisks.length === 0) {
    lines.push("- Baseline values are fixture-based and should be used for relative comparison, not absolute UX claims.");
  } else {
    for (const risk of report.residualRisks) {
      lines.push(`- ${risk}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const packageJson = await readJson("package.json");
  const fragments = await Promise.all(fragmentPaths.map(readJson));
  for (const fragment of fragments) {
    if (fragment.schemaVersion !== schemaVersion) {
      throw new Error(`Unsupported baseline fragment schema: ${fragment.schemaVersion}`);
    }
    if (!Array.isArray(fragment.metrics)) {
      throw new Error(`Baseline fragment is missing metrics array: ${fragment.source ?? "unknown"}`);
    }
  }
  const report = {
    schemaVersion,
    generatedAt: new Date().toISOString(),
    version: packageJson.version,
    git: {
      branch: getGitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
      commit: getGitValue(["rev-parse", "HEAD"], "unknown"),
    },
    metrics: fragments.flatMap((fragment) => fragment.metrics),
    sources: fragments.map((fragment) => ({ source: fragment.source, generatedAt: fragment.generatedAt })),
    residualRisks: fragments.flatMap((fragment) => fragment.residualRisks ?? []),
  };
  const latestJson = "docs/perf/baseline.json";
  const latestMarkdown = "docs/perf/baseline.md";
  const archiveJson = resolveArchivePath(packageJson.version, "json");
  const archiveMarkdown = archiveJson.replace(/\.json$/, ".md");
  await writeText(latestJson, `${JSON.stringify(report, null, 2)}\n`);
  await writeText(latestMarkdown, createMarkdown(report));
  await mkdir(dirname(resolve(process.cwd(), archiveJson)), { recursive: true });
  await copyFile(resolve(process.cwd(), latestJson), resolve(process.cwd(), archiveJson));
  await copyFile(resolve(process.cwd(), latestMarkdown), resolve(process.cwd(), archiveMarkdown));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
