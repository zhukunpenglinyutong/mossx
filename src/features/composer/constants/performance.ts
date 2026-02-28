/**
 * Performance Constants (from idea-claude-code-gui)
 */

export const TEXT_LENGTH_THRESHOLDS = {
  COMPLETION_DETECTION: 10000,
  FILE_TAG_RENDERING: 50000,
  LARGE_TEXT_INSERTION: 5000,
} as const;

export const RENDERING_LIMITS = {
  MAX_FILE_TAGS_PER_RENDER: 50,
} as const;

export const PERF_TIMING = {
  MIN_LOG_THRESHOLD_MS: 5,
  SLOW_OPERATION_THRESHOLD_MS: 50,
} as const;

export const DEBOUNCE_TIMING = {
  COMPLETION_DETECTION_MS: 80,
  FILE_TAG_RENDERING_MS: 300,
  ON_INPUT_CALLBACK_MS: 100,
} as const;

export type TextLengthThresholds = typeof TEXT_LENGTH_THRESHOLDS;
export type RenderingLimits = typeof RENDERING_LIMITS;
export type PerfTiming = typeof PERF_TIMING;
export type DebounceTiming = typeof DEBOUNCE_TIMING;
