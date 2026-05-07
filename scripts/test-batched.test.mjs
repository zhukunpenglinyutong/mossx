import test from "node:test";
import assert from "node:assert/strict";
import { parseVitestBatchConfig, testBatchedInternals } from "./test-batched.mjs";

test("enables heavy integration suites via explicit CLI flag", () => {
  const config = parseVitestBatchConfig(["--include-heavy"], {
    VITEST_BATCH_SIZE: "6",
  });

  assert.deepEqual(config, {
    batchSize: 6,
    includeHeavyIntegration: true,
  });
});

test("keeps env-based heavy integration fallback for CI callers", () => {
  const config = parseVitestBatchConfig([], {
    VITEST_BATCH_SIZE: "4",
    VITEST_INCLUDE_HEAVY: "1",
  });

  assert.deepEqual(config, {
    batchSize: 4,
    includeHeavyIntegration: true,
  });
});

test("rejects unsupported CLI arguments", () => {
  assert.throws(
    () => parseVitestBatchConfig(["--unknown"], { VITEST_BATCH_SIZE: "4" }),
    /Unknown argument: --unknown/,
  );
});

test("normalizes ripgrep file output across line endings", () => {
  assert.deepEqual(
    testBatchedInternals.parseRipgrepFileList("src/b.test.tsx\r\nsrc/a.test.ts\n\n"),
    ["src/a.test.ts", "src/b.test.tsx"],
  );
});

test("quotes login-shell ripgrep arguments safely", () => {
  assert.equal(testBatchedInternals.shellQuote("src/path with ' quote"), "'src/path with '\\'' quote'");
});
