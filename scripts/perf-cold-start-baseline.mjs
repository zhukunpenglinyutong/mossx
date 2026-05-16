import { execFile } from "node:child_process";
import { createGzip } from "node:zlib";
import { createReadStream } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";

const verbose = process.argv.includes("--verbose");
const skipBuild = process.argv.includes("--skip-build");

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    execFile(command, args, { cwd: process.cwd(), env: { ...process.env, VITE_ENABLE_PERF_BASELINE: "1" } }, (error) => {
      if (error) {
        rejectRun(error);
        return;
      }
      resolveRun();
    });
  });
}

async function gzipSize(path) {
  let total = 0;
  await pipeline(
    createReadStream(path),
    createGzip(),
    new Writable({
      write(chunk, _encoding, callback) {
        total += chunk.length;
        callback();
      },
    }),
  );
  return total;
}

async function collectJavaScriptAssets() {
  const assetsDir = resolve(process.cwd(), "dist/assets");
  let files;
  try {
    files = await readdir(assetsDir);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const jsFiles = files.filter((file) => extname(file) === ".js");
  const sized = await Promise.all(
    jsFiles.map(async (file) => {
      const absolutePath = resolve(assetsDir, file);
      const fileStat = await stat(absolutePath);
      return {
        file,
        bytes: fileStat.size,
        gzipBytes: await gzipSize(absolutePath),
      };
    }),
  );
  return sized.sort((left, right) => right.gzipBytes - left.gzipBytes);
}

async function writeJson(path, value) {
  const absolutePath = resolve(process.cwd(), path);
  await mkdir(resolve(absolutePath, ".."), { recursive: true });
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8"),
  );
}

async function main() {
  if (!skipBuild) {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    await run(npmCommand, ["exec", "vite", "--", "build", "--mode", "baseline"]);
  }
  const assets = await collectJavaScriptAssets();
  const [mainAsset, vendorAsset] = assets;
  const headlessReason = "Tauri webview headless cold-start timing is not available in this script; bundle baseline is recorded.";
  const missingBundleReason = "No Vite JavaScript assets were found under dist/assets.";
  const fragment = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    source: "cold-start",
    metrics: [
      {
        scenario: "S-CS-COLD",
        metric: "bundleSizeMain",
        value: mainAsset?.gzipBytes ?? null,
        unit: "bytes",
        notes: mainAsset ? basename(mainAsset.file) : "no JS asset found",
        unsupportedReason: mainAsset ? undefined : missingBundleReason,
      },
      {
        scenario: "S-CS-COLD",
        metric: "bundleSizeVendor",
        value: vendorAsset?.gzipBytes ?? null,
        unit: "bytes",
        notes: vendorAsset ? basename(vendorAsset.file) : "no secondary JS asset found",
        unsupportedReason: vendorAsset ? undefined : missingBundleReason,
      },
      {
        scenario: "S-CS-COLD",
        metric: "firstPaintMs",
        value: null,
        unit: "ms",
        unsupportedReason: headlessReason,
      },
      {
        scenario: "S-CS-COLD",
        metric: "firstInteractiveMs",
        value: null,
        unit: "ms",
        unsupportedReason: headlessReason,
      },
    ],
    notes: [`platform=${process.platform}`],
  };
  await writeJson("docs/perf/cold-start-baseline.json", fragment);
  if (verbose) {
    console.info(`cold-start baseline assets: ${assets.length}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
