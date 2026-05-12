#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const allowedFeatureFiles = new Map();

const p0BlockedFiles = new Set([
  "src/features/status-panel/components/CheckpointCommitDialog.tsx",
  "src/features/app/hooks/useSidebarMenus.ts",
  "src/features/messages/hooks/useFileLinkOpener.ts",
]);

function listTrackedFiles() {
  const output = execFileSync("git", ["ls-files", "src/features"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return output.split("\n").filter(Boolean);
}

const violations = [];
const inventory = [];

for (const filePath of listTrackedFiles()) {
  if (!/\.[cm]?[tj]sx?$/.test(filePath)) {
    continue;
  }
  if (/\.(test|spec)\.[cm]?[tj]sx?$/.test(filePath)) {
    continue;
  }
  const absolutePath = resolve(repoRoot, filePath);
  const source = readFileSync(absolutePath, "utf8");
  const usesNativeMenu =
    source.includes("@tauri-apps/api/menu") ||
    /\bMenu\.new\s*\(/.test(source) ||
    /\bMenuItem\.new\s*\(/.test(source) ||
    /\.popup\s*\(/.test(source);
  if (!usesNativeMenu) {
    continue;
  }
  inventory.push(filePath);
  if (p0BlockedFiles.has(filePath)) {
    violations.push(`${filePath}: P0 deadlock path must not use Tauri native menu APIs`);
    continue;
  }
  if (!allowedFeatureFiles.has(filePath)) {
    violations.push(`${filePath}: native menu usage is not allowlisted`);
  }
}

if (inventory.length > 0) {
  console.log("Native menu usage inventory:");
  for (const filePath of inventory) {
    const metadata = allowedFeatureFiles.get(filePath);
    const suffix = metadata
      ? ` [allowlist:${metadata.category}; owner:${metadata.owner}]`
      : "";
    console.log(`- ${relative(repoRoot, resolve(repoRoot, filePath))}${suffix}`);
  }
}

if (violations.length > 0) {
  console.error("\nForbidden native menu usage:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Native menu usage guard passed.");
