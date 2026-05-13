#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const WAYLAND_LIBRARY_PATTERN = /^libwayland-.+/;

function parseArgs(argv) {
  const config = {
    appImagePath: null,
    appImageToolPath: process.env.APPIMAGETOOL || "appimagetool",
    arch: process.env.ARCH || null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--appimage") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --appimage");
      }
      config.appImagePath = value;
      index += 1;
      continue;
    }
    if (token === "--appimagetool") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --appimagetool");
      }
      config.appImageToolPath = value;
      index += 1;
      continue;
    }
    if (token === "--arch") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --arch");
      }
      config.arch = value;
      index += 1;
      continue;
    }
    if (!token.startsWith("--") && config.appImagePath === null) {
      config.appImagePath = token;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (!config.appImagePath) {
    throw new Error("Provide --appimage <path>.");
  }

  return config;
}

function isWaylandLibraryName(fileName) {
  return WAYLAND_LIBRARY_PATTERN.test(fileName);
}

async function listWaylandLibraries(appDir) {
  const libDir = path.join(appDir, "usr", "lib");
  if (!existsSync(libDir)) {
    return [];
  }
  const entries = await readdir(libDir);
  return entries
    .filter(isWaylandLibraryName)
    .map((entry) => path.join(libDir, entry))
    .sort();
}

async function removeWaylandLibraries(appDir) {
  const libraries = await listWaylandLibraries(appDir);
  for (const libraryPath of libraries) {
    await rm(libraryPath, { recursive: true, force: true });
  }
  return libraries;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    ...options,
    env: {
      ...process.env,
      APPIMAGE_EXTRACT_AND_RUN: "1",
      ...options.env,
    },
  });
  if (result.error) {
    throw new Error(`${command} ${args.join(" ")} failed to start: ${result.error.message}`);
  }
  if (result.status === 0) {
    return result;
  }
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  throw new Error(`${command} ${args.join(" ")} failed${output ? `:\n${output}` : ""}`);
}

function detectArch(appImagePath) {
  const fileName = path.basename(appImagePath).toLowerCase();
  if (fileName.includes("aarch64") || fileName.includes("arm64")) {
    return "aarch64";
  }
  return "x86_64";
}

async function pruneAppImageWaylandLibraries({
  appImagePath,
  appImageToolPath = "appimagetool",
  arch = null,
  commandRunner = runCommand,
  workingRoot = null,
} = {}) {
  if (!appImagePath) {
    throw new Error("appImagePath is required");
  }
  if (!existsSync(appImagePath)) {
    throw new Error(`AppImage not found: ${appImagePath}`);
  }
  if (appImageToolPath !== "appimagetool" && !existsSync(appImageToolPath)) {
    throw new Error(`appimagetool not found: ${appImageToolPath}`);
  }

  const absoluteAppImagePath = path.resolve(appImagePath);
  await chmod(absoluteAppImagePath, 0o755).catch(() => undefined);

  const tempRoot = workingRoot ?? (await mkdtemp(path.join(os.tmpdir(), "ccgui-appimage-prune-")));
  const backupPath = path.join(tempRoot, `${path.basename(absoluteAppImagePath)}.backup`);
  const extractedAppDir = path.join(tempRoot, "squashfs-root");
  let shouldCleanupTempRoot = workingRoot === null;

  try {
    await commandRunner(absoluteAppImagePath, ["--appimage-extract"], { cwd: tempRoot });
    if (!existsSync(extractedAppDir)) {
      throw new Error("AppImage extraction did not produce squashfs-root");
    }

    const removedLibraries = await removeWaylandLibraries(extractedAppDir);
    await copyFile(absoluteAppImagePath, backupPath);
    await rm(absoluteAppImagePath, { force: true });

    try {
      await commandRunner(appImageToolPath, [extractedAppDir, absoluteAppImagePath], {
        cwd: tempRoot,
        env: {
          ARCH: arch ?? detectArch(absoluteAppImagePath),
        },
      });
    } catch (error) {
      if (existsSync(backupPath)) {
        await rm(absoluteAppImagePath, { force: true });
        await rename(backupPath, absoluteAppImagePath);
      }
      throw error;
    }

    await chmod(absoluteAppImagePath, 0o755).catch(() => undefined);
    await rm(backupPath, { force: true });
    return {
      appImagePath: absoluteAppImagePath,
      removedLibraries: removedLibraries.map((libraryPath) => path.relative(extractedAppDir, libraryPath)),
    };
  } finally {
    if (shouldCleanupTempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const result = await pruneAppImageWaylandLibraries(config);
  if (result.removedLibraries.length === 0) {
    console.log(`[appimage-prune] no bundled libwayland libraries found in ${result.appImagePath}`);
    return;
  }
  console.log(`[appimage-prune] removed ${result.removedLibraries.length} bundled Wayland libraries:`);
  for (const libraryPath of result.removedLibraries) {
    console.log(`  - ${libraryPath}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`[appimage-prune] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export {
  detectArch,
  isWaylandLibraryName,
  listWaylandLibraries,
  parseArgs,
  pruneAppImageWaylandLibraries,
  removeWaylandLibraries,
};
