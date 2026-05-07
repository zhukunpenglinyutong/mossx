import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function parseVitestBatchConfig(argv = [], env = process.env) {
  let includeHeavyIntegration = env.VITEST_INCLUDE_HEAVY === "1";
  for (const token of argv) {
    if (token === "--include-heavy") {
      includeHeavyIntegration = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  const batchSize = Number.parseInt(env.VITEST_BATCH_SIZE ?? "4", 10);
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error(`Invalid VITEST_BATCH_SIZE: ${env.VITEST_BATCH_SIZE ?? ""}`);
  }

  return {
    batchSize,
    includeHeavyIntegration,
  };
}

export const testBatchedInternals = {
  parseRipgrepFileList,
  shellQuote,
};

export function runVitestBatches(argv = process.argv.slice(2), env = process.env) {
  const { batchSize, includeHeavyIntegration } = parseVitestBatchConfig(argv, env);
  const testFiles = listTestFiles().filter((file) => {
    if (includeHeavyIntegration) {
      return true;
    }
    return !file.endsWith(".integration.test.tsx");
  });

  if (testFiles.length === 0) {
    console.log("No test files found.");
    return 0;
  }

  if (!includeHeavyIntegration) {
    console.log(
      "[vitest-batch] heavy *.integration.test.tsx suites are excluded by default; set VITEST_INCLUDE_HEAVY=1 or pass --include-heavy to include.",
    );
  }

  const totalBatches = Math.ceil(testFiles.length / batchSize);
  for (let i = 0; i < totalBatches; i += 1) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, testFiles.length);
    const files = testFiles.slice(start, end);
    console.log(
      `[vitest-batch] ${i + 1}/${totalBatches} files ${start + 1}-${end}/${testFiles.length}`,
    );
    const result = spawnSync(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--maxWorkers",
        "1",
        "--minWorkers",
        "1",
        ...files,
      ],
      {
        stdio: "inherit",
        env: {
          ...env,
          VITEST_INCLUDE_HEAVY: includeHeavyIntegration ? "1" : env.VITEST_INCLUDE_HEAVY,
          NODE_OPTIONS: withMemoryOption(env.NODE_OPTIONS, 12288),
        },
      },
    );
    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  console.log(`[vitest-batch] completed ${testFiles.length} test files.`);
  return 0;
}

function listTestFiles() {
  const fromRipgrep = listWithRipgrep();
  if (fromRipgrep.length > 0) {
    return fromRipgrep;
  }
  return listWithFs("src");
}

export function listWithRipgrep() {
  const rgArgs = ["--files", "src", "-g", "*.test.ts", "-g", "*.test.tsx"];
  try {
    const output = execFileSync("rg", rgArgs, { encoding: "utf8" }).trim();
    return parseRipgrepFileList(output);
  } catch (error) {
    if (!isCommandNotFound(error)) {
      throw error;
    }
    const fromLoginShell = listWithLoginShellRipgrep(rgArgs);
    if (fromLoginShell.length > 0) {
      return fromLoginShell;
    }
    console.warn("[vitest-batch] rg not found after login-shell retry; falling back to fs scan.");
    return [];
  }
}

function listWithLoginShellRipgrep(rgArgs) {
  if (process.platform === "win32") {
    return [];
  }
  const quotedArgs = rgArgs.map(shellQuote).join(" ");
  try {
    const output = execFileSync(
      "zsh",
      ["-lc", `source ~/.zshrc >/dev/null 2>&1; rg ${quotedArgs}`],
      { encoding: "utf8" },
    ).trim();
    return parseRipgrepFileList(output);
  } catch (error) {
    if (isCommandNotFound(error)) {
      return [];
    }
    throw error;
  }
}

function parseRipgrepFileList(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function isCommandNotFound(error) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function listWithFs(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
        out.push(full);
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function withMemoryOption(currentOptions, memoryMb = 12288) {
  const option = `--max-old-space-size=${memoryMb}`;
  if (!currentOptions || currentOptions.trim().length === 0) {
    return option;
  }
  if (currentOptions.includes("--max-old-space-size=")) {
    return currentOptions;
  }
  return `${currentOptions} ${option}`.trim();
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  process.exit(runVitestBatches());
}
