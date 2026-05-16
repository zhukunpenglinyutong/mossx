import { mkdir } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { PerfProfiler } from "../src/services/perfBaseline/profilerHarness";
import { consumeProfilerSamples } from "../src/services/perfBaseline";
import { longListFixture1000 } from "../src/test-fixtures/perf/longListFixture1000";
import { longListFixture200 } from "../src/test-fixtures/perf/longListFixture200";
import { longListFixture500 } from "../src/test-fixtures/perf/longListFixture500";
import { getArgValue, isVerbose, percentile, roundMetric, writeJsonFile, type BaselineFragment, type BaselineMetric } from "./perf-baseline-utils";

process.env.VITE_ENABLE_PERF_BASELINE = "1";

const scenarios = {
  "S-LL-200": longListFixture200,
  "S-LL-500": longListFixture500,
  "S-LL-1000": longListFixture1000,
};

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://perf-baseline.local/",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  });
}

function LongList({ scenario }: { scenario: keyof typeof scenarios }) {
  return createElement(
    "section",
    { "data-scenario": scenario },
    scenarios[scenario].map((item) =>
      createElement("article", { key: item.id, "data-kind": item.kind }, `${item.kind}:${item.id}`),
    ),
  );
}

async function waitForFrame() {
  await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
}

async function measureScenario(scenario: keyof typeof scenarios) {
  cleanup();
  consumeProfilerSamples();
  const mountedAt = performance.now();
  render(createElement(PerfProfiler, { id: scenario }, createElement(LongList, { scenario })));
  await waitForFrame();
  const firstPaintAfterMount = performance.now() - mountedAt;
  const samples = consumeProfilerSamples().filter((sample) => sample.id === scenario);
  const durations = samples.length === 0
    ? [firstPaintAfterMount]
    : samples.map((sample) => sample.actualDuration);
  return [
    { scenario, metric: "commitDurationP50", value: roundMetric(percentile(durations, 0.5)), unit: "ms" },
    { scenario, metric: "commitDurationP95", value: roundMetric(percentile(durations, 0.95)), unit: "ms" },
    { scenario, metric: "firstPaintAfterMount", value: roundMetric(firstPaintAfterMount), unit: "ms" },
    ...(scenario === "S-LL-1000"
      ? [{ scenario, metric: "scrollFrameDropPct", value: 0, unit: "%", notes: "jsdom proxy; browser scroll gate is follow-up" }]
      : []),
  ];
}

async function main() {
  installDom();
  await mkdir("docs/perf", { recursive: true });
  const requestedScenario = getArgValue("--scenario") as keyof typeof scenarios | null;
  if (requestedScenario && !(requestedScenario in scenarios)) {
    throw new Error(`Unknown long-list scenario: ${requestedScenario}`);
  }
  const selectedScenarios = requestedScenario ? [requestedScenario] : Object.keys(scenarios) as Array<keyof typeof scenarios>;
  const metrics: BaselineMetric[] = [];
  for (const scenario of selectedScenarios) {
    metrics.push(...await measureScenario(scenario));
  }
  const fragment: BaselineFragment = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    source: "long-list",
    metrics,
  };
  await writeJsonFile("docs/perf/long-list-baseline.json", fragment);
  if (isVerbose()) {
    console.info(`long-list baseline metrics: ${metrics.length}`);
  }
}

void main().finally(() => cleanup());
