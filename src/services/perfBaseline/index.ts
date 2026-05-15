import type { MetricType } from "web-vitals";
import { appendRendererPerfDiagnostic } from "../rendererDiagnostics";

export const PERF_BASELINE_SCHEMA_VERSION = "1.0";
export const MAX_PERF_ENTRIES = 1000;
export const PERF_SAMPLE_RATE_PROFILER = 1;
export const WEB_VITALS_RATING_SCHEMA = "v3";

export type PerfProfilerSample = {
  id: string;
  phase: "mount" | "update" | "nested-update";
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
};

type PerfEnv = {
  VITE_ENABLE_PERF_BASELINE?: string;
  DEV?: boolean;
  PROD?: boolean;
};

let webVitalsInstalled = false;
const profilerSamples: PerfProfilerSample[] = [];

function readPerfEnv(): PerfEnv {
  const viteEnv = import.meta.env as PerfEnv | undefined;
  const processEnv = typeof process === "undefined" ? undefined : process.env;
  return {
    VITE_ENABLE_PERF_BASELINE: viteEnv?.VITE_ENABLE_PERF_BASELINE
      ?? processEnv?.VITE_ENABLE_PERF_BASELINE,
    DEV: viteEnv?.DEV ?? processEnv?.NODE_ENV !== "production",
    PROD: viteEnv?.PROD ?? processEnv?.NODE_ENV === "production",
  };
}

export function isPerfBaselineEnabled(env: PerfEnv = readPerfEnv()) {
  return env.VITE_ENABLE_PERF_BASELINE === "1" && env.PROD !== true;
}

export function reportWebVital(metric: MetricType) {
  if (!isPerfBaselineEnabled()) {
    return;
  }
  appendRendererPerfDiagnostic("perf.web-vital", {
    schemaVersion: PERF_BASELINE_SCHEMA_VERSION,
    ratingSchema: WEB_VITALS_RATING_SCHEMA,
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    navigationType: metric.navigationType,
    id: metric.id,
    delta: metric.delta,
  });
}

export function reportProfilerSample(sample: PerfProfilerSample) {
  if (!isPerfBaselineEnabled()) {
    return;
  }
  profilerSamples.push(sample);
  if (profilerSamples.length > MAX_PERF_ENTRIES) {
    profilerSamples.splice(0, profilerSamples.length - MAX_PERF_ENTRIES);
  }
}

export function consumeProfilerSamples() {
  const samples = profilerSamples.splice(0, profilerSamples.length);
  return samples;
}

export async function installPerfBaselineWebVitals() {
  if (webVitalsInstalled || !isPerfBaselineEnabled()) {
    return;
  }
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
    return;
  }
  webVitalsInstalled = true;
  const { onCLS, onINP, onLCP } = await import("web-vitals");
  onCLS(reportWebVital);
  onINP(reportWebVital);
  onLCP(reportWebVital);
}

export function __resetPerfBaselineForTests() {
  webVitalsInstalled = false;
  profilerSamples.length = 0;
}
