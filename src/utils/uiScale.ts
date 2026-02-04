export const UI_SCALE_MIN = 0.1;
export const UI_SCALE_MAX = 3;
export const UI_SCALE_STEP = 0.1;
export const UI_SCALE_DEFAULT = 1;

export function clampUiScale(value: number) {
  if (!Number.isFinite(value)) {
    return UI_SCALE_DEFAULT;
  }
  const rounded = Math.round(value / UI_SCALE_STEP) * UI_SCALE_STEP;
  const clamped = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, rounded));
  return Number(clamped.toFixed(1));
}

export function formatUiScale(value: number) {
  return clampUiScale(value).toFixed(1);
}
