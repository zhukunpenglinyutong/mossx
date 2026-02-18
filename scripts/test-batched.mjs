import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const batchSize = Number.parseInt(process.env.VITEST_BATCH_SIZE ?? "4", 10);
const includeHeavyIntegration = process.env.VITEST_INCLUDE_HEAVY === "1";
if (!Number.isFinite(batchSize) || batchSize <= 0) {
  throw new Error(`Invalid VITEST_BATCH_SIZE: ${process.env.VITEST_BATCH_SIZE ?? ""}`);
}

const testFiles = listTestFiles().filter((file) => {
  if (includeHeavyIntegration) {
    return true;
  }
  return !file.endsWith(".integration.test.tsx");
});

if (testFiles.length === 0) {
  console.log("No test files found.");
  process.exit(0);
}

if (!includeHeavyIntegration) {
  console.log(
    "[vitest-batch] heavy *.integration.test.tsx suites are excluded by default; set VITEST_INCLUDE_HEAVY=1 to include.",
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
        ...process.env,
        NODE_OPTIONS: withMemoryOption(process.env.NODE_OPTIONS, 12288),
      },
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`[vitest-batch] completed ${testFiles.length} test files.`);

function listTestFiles() {
  const fromRipgrep = listWithRipgrep();
  if (fromRipgrep.length > 0) {
    return fromRipgrep;
  }
  return listWithFs("src");
}

function listWithRipgrep() {
  try {
    const rgArgs = ["--files", "src", "-g", "*.test.ts", "-g", "*.test.tsx"];
    const output = execFileSync("rg", rgArgs, { encoding: "utf8" }).trim();
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      console.warn("[vitest-batch] rg not found; falling back to fs scan.");
      return [];
    }
    throw error;
  }
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
