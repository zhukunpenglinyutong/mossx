#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BRAND_PATTERN = /\b(?:CodeMoss|MossX|mossx|codemoss|moss-x|moss_x)\b/g;

const INCLUDE_PATHS = [
  "src",
  "src-tauri/src",
  "scripts",
  ".github/workflows/release.yml",
  "README.md",
  "README.zh-CN.md",
  "docs/index.html",
  "docs/changelog.html",
  "package.json",
  "package-lock.json",
  "flake.nix",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
  "src-tauri/tauri.conf.json",
  "src-tauri/tauri.windows.conf.json",
  "src-tauri/tauri.linux.conf.json",
];

const SKIP_DIR_NAMES = new Set([".git", "node_modules", "dist", "target"]);

const SKIP_PATH_PATTERNS = [
  /^src\/services\/migrateLocalStorage(?:\.test)?\.ts$/,
  /^src\/features\/prompts\/promptUsage(?:\.test)?\.ts$/,
  /^src\/features\/composer\/components\/ChatInputBox\/hooks\/usePasteAndDrop(?:\.test)?\.ts$/,
  /^src\/features\/runtime-log\/hooks\/useRuntimeLogSession\.ts$/,
  /^src\/features\/runtime-log\/components\/RuntimeLogPanel(?:\.test)?\.tsx$/,
  /^src\/features\/workspaces\/utils\/defaultWorkspace(?:\.test)?\.ts$/,
  /^src\/app-shell-parts\/useAppShellSections\.ts$/,
  /^src-tauri\/src\/app_paths\.rs$/,
  /^src-tauri\/src\/codex\/home\.rs$/,
  /^src-tauri\/src\/codex\/mod\.rs$/,
  /^src-tauri\/src\/web_service\/daemon_bootstrap\.rs$/,
  /^src-tauri\/src\/vendors\/commands\.rs$/,
  /^src-tauri\/src\/backend\/app_server\.rs$/,
  /^src-tauri\/src\/claude_commands\.rs$/,
  /^src-tauri\/src\/client_storage\.rs$/,
  /^src-tauri\/src\/engine\/claude_history\.rs$/,
  /^src-tauri\/src\/engine\/claude_message_content\.rs$/,
  /^src-tauri\/src\/engine\/commands_tests\.rs$/,
  /^src-tauri\/src\/engine\/gemini\.rs$/,
  /^src-tauri\/src\/engine\/gemini_history\.rs$/,
  /^src-tauri\/src\/engine\/gemini_tests\.rs$/,
  /^src-tauri\/src\/files\/io\.rs$/,
  /^src-tauri\/src\/files\/ops\.rs$/,
  /^src-tauri\/src\/git\/mod\.rs$/,
  /^src-tauri\/src\/local_usage\.rs$/,
  /^src-tauri\/src\/project_memory\.rs$/,
  /^src-tauri\/src\/runtime_log\/mod\.rs$/,
  /^src-tauri\/src\/shared\/thread_titles_core\.rs$/,
  /^src-tauri\/src\/shared\/workspaces_core\.rs$/,
  /^src-tauri\/src\/skills\.rs$/,
  /^src-tauri\/src\/storage\.rs$/,
  /^src-tauri\/src\/workspaces\/commands\.rs$/,
  /^src-tauri\/src\/workspaces\/files\.rs$/,
  /^src-tauri\/src\/workspaces\/macos\.rs$/,
  /^src-tauri\/src\/workspaces\/tests\.rs$/,
  /^src\/features\/vendors\/hooks\/usePluginModels\.ts$/,
  /^src\/features\/vendors\/hooks\/useProviderManagement\.ts$/,
  /^src\/features\/vendors\/components\/VendorSettingsPanel\.tsx$/,
  /^src\/features\/models\/constants\.ts$/,
  /^scripts\/check-branding\.mjs$/,
];

const ALLOWED_LINE_PATTERNS = [
  {
    path: /^src-tauri\/src\/bin\/cc_gui_daemon\/web_service_runtime\.rs$/,
    line:
      /file_name != "cc_gui_daemon" && file_name != "moss_x_daemon" && file_name != "moss-x-daemon"/,
  },
];

function normalizeRelativePath(relativePath) {
  return relativePath.split(/[\\/]+/).join("/");
}

function shouldSkip(relativePath) {
  if (
    relativePath === "CHANGELOG.md" ||
    relativePath.includes("/docs/research/") ||
    relativePath.includes("/docs/plans/archived/") ||
    relativePath.includes("/translations-additions-") ||
    /\.test\.(ts|tsx|rs)$/.test(relativePath) ||
    /(?:^|\/)(?:tests|.*_tests)\.rs$/.test(relativePath)
  ) {
    return true;
  }
  return SKIP_PATH_PATTERNS.some((pattern) => pattern.test(relativePath));
}

function isAllowedLegacyCompatibilityLine(relativePath, line) {
  return ALLOWED_LINE_PATTERNS.some(
    ({ path, line: linePattern }) => path.test(relativePath) && linePattern.test(line),
  );
}

function collectFiles(absPath) {
  const stats = statSync(absPath);
  if (stats.isFile()) {
    return [absPath];
  }

  const files = [];
  for (const entry of readdirSync(absPath, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIR_NAMES.has(entry.name)) {
      continue;
    }
    files.push(...collectFiles(join(absPath, entry.name)));
  }
  return files;
}

const offenders = [];

for (const includePath of INCLUDE_PATHS) {
  const absolutePath = join(ROOT, includePath);
  for (const file of collectFiles(absolutePath)) {
    const rel = normalizeRelativePath(relative(ROOT, file));
    if (shouldSkip(rel)) {
      continue;
    }
    const content = readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      BRAND_PATTERN.lastIndex = 0;
      if (
        BRAND_PATTERN.test(lines[index]) &&
        !isAllowedLegacyCompatibilityLine(rel, lines[index])
      ) {
        offenders.push(`${rel}:${index + 1}:${lines[index].trim()}`);
      }
    }
  }
}

if (offenders.length > 0) {
  console.error("Branding check failed. Legacy names remain in shipping surfaces:\n");
  for (const offender of offenders) {
    console.error(offender);
  }
  process.exit(1);
}

console.log("Branding check passed.");
