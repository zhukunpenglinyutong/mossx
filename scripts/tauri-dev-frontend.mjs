import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const ensureDevPortScript = path.join(scriptDir, "ensure-dev-port.mjs");
const vitePackageJsonPath = require.resolve("vite/package.json");
const viteBinPath = path.join(path.dirname(vitePackageJsonPath), "bin", "vite.js");

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`frontend bootstrap interrupted by signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`frontend bootstrap exited with code ${code ?? "unknown"}`));
        return;
      }
      resolve();
    });
  });
}

function spawnViteDevServer() {
  const child = spawn(process.execPath, [viteBinPath], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));

  child.once("error", (error) => {
    console.error(`tauri-dev-frontend: failed to start vite\n${error.message}`);
    process.exit(1);
  });

  child.once("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

async function main() {
  await runNodeScript(ensureDevPortScript);
  spawnViteDevServer();
}

try {
  await main();
} catch (error) {
  console.error(
    `tauri-dev-frontend: failed\n${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
