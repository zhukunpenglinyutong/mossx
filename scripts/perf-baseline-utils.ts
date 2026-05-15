import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type BaselineMetric = {
  scenario: string;
  metric: string;
  value: number | null;
  unit: string;
  notes?: string;
  unsupportedReason?: string;
};

export type BaselineFragment = {
  schemaVersion: "1.0";
  generatedAt: string;
  source: string;
  metrics: BaselineMetric[];
  notes?: string[];
  residualRisks?: string[];
};

export function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

export function roundMetric(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

export async function writeJsonFile(path: string, value: unknown) {
  const absolutePath = resolve(process.cwd(), path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(process.cwd(), path), "utf-8")) as T;
}

export function isVerbose() {
  return process.argv.includes("--verbose");
}

export function getArgValue(name: string) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}
