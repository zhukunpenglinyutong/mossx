/* eslint-disable no-console */

import { PERF_TIMING } from '../constants/performance';

const DEBUG: boolean = (() => {
  try {
    return Boolean((import.meta as any)?.env?.DEV);
  } catch {
    return false;
  }
})();

const PERF_DEBUG = DEBUG;

export function debugLog(...args: unknown[]): void {
  if (!DEBUG) return;
  console.log(...args);
}

export function debugWarn(...args: unknown[]): void {
  if (!DEBUG) return;
  console.warn(...args);
}

export function debugError(...args: unknown[]): void {
  if (!DEBUG) return;
  console.error(...args);
}

export function perfTimer(name: string) {
  if (!PERF_DEBUG) {
    return {
      mark: () => {},
      end: () => {},
      log: () => {},
    };
  }

  const startTime = performance.now();
  const marks: Array<{ label: string; time: number }> = [];

  return {
    mark(label: string) {
      marks.push({ label, time: performance.now() - startTime });
    },
    end() {
      const totalTime = performance.now() - startTime;
      if (totalTime > PERF_TIMING.MIN_LOG_THRESHOLD_MS) {
        const markStr = marks.map((m) => `${m.label}: ${m.time.toFixed(2)}ms`).join(', ');
        console.log(
          `%c[PERF] ${name}: ${totalTime.toFixed(2)}ms ${markStr ? `(${markStr})` : ''}`,
          totalTime > PERF_TIMING.SLOW_OPERATION_THRESHOLD_MS
            ? 'color: red; font-weight: bold'
            : 'color: orange'
        );
      }
      return totalTime;
    },
    log(message: string) {
      const elapsed = performance.now() - startTime;
      console.log(`%c[PERF] ${name} - ${message}: ${elapsed.toFixed(2)}ms`, 'color: gray');
    },
  };
}
