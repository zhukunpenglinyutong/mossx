import { JSDOM } from "jsdom";
import { createElement, useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { PerfProfiler } from "../src/services/perfBaseline/profilerHarness";
import { consumeProfilerSamples } from "../src/services/perfBaseline";
import { composerInputFixture50, type ComposerInputStep } from "../src/test-fixtures/perf/composerInputFixture50";
import { composerInputFixture100ime } from "../src/test-fixtures/perf/composerInputFixture100ime";
import { isVerbose, percentile, roundMetric, writeJsonFile, type BaselineFragment, type BaselineMetric } from "./perf-baseline-utils";

process.env.VITE_ENABLE_PERF_BASELINE = "1";

const scenarios: Record<string, ComposerInputStep[]> = {
  "S-CI-50": composerInputFixture50,
  "S-CI-100-IME": composerInputFixture100ime,
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
    Event: dom.window.Event,
    CompositionEvent: dom.window.CompositionEvent,
  });
}

function ComposerProxy() {
  const [value, setValue] = useState("");
  return createElement("textarea", {
    "aria-label": "composer baseline input",
    value,
    onChange: (event: { target: { value: string } }) => setValue(event.target.value),
  });
}

async function measureScenario(scenario: string, steps: ComposerInputStep[]): Promise<BaselineMetric[]> {
  cleanup();
  consumeProfilerSamples();
  const { getByLabelText } = render(
    createElement(PerfProfiler, { id: scenario }, createElement(ComposerProxy)),
  );
  const input = getByLabelText("composer baseline input") as HTMLTextAreaElement;
  let value = "";
  const latencies: number[] = [];
  const compositionLatencies: number[] = [];
  let eventLossCount = 0;

  for (const step of steps) {
    const startedAt = performance.now();
    if (step.kind === "composition-start") {
      fireEvent.compositionStart(input, { data: step.value });
      continue;
    }
    if (step.kind === "composition-end") {
      fireEvent.compositionEnd(input, { data: step.value });
      compositionLatencies.push(performance.now() - startedAt);
      continue;
    }
    value += step.value;
    fireEvent.change(input, { target: { value } });
    if (input.value !== value) {
      eventLossCount += 1;
    }
    latencies.push(performance.now() - startedAt);
  }

  const compositionToCommit = compositionLatencies.length === 0
    ? 0
    : percentile(compositionLatencies, 0.95);
  return [
    { scenario, metric: "keystrokeToCommitP95", value: roundMetric(percentile(latencies, 0.95)), unit: "ms" },
    { scenario, metric: "inputEventLossCount", value: eventLossCount, unit: "count" },
    { scenario, metric: "compositionToCommit", value: roundMetric(compositionToCommit), unit: "ms" },
  ];
}

async function main() {
  installDom();
  const metrics: BaselineMetric[] = [];
  for (const [scenario, steps] of Object.entries(scenarios)) {
    metrics.push(...await measureScenario(scenario, steps));
  }
  const fragment: BaselineFragment = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    source: "composer-input",
    metrics,
  };
  await writeJsonFile("docs/perf/composer-baseline.json", fragment);
  if (isVerbose()) {
    console.info(`composer baseline metrics: ${metrics.length}`);
  }
}

void main().finally(() => cleanup());
