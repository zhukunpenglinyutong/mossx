export function normalizeBoundedIntegerInput(
  rawValue: string,
  fallbackValue: number,
  minValue: number,
  maxValue: number,
): number {
  const parsedValue = Number.parseInt(rawValue.trim(), 10);
  if (!Number.isFinite(parsedValue)) {
    return fallbackValue;
  }
  return Math.max(minValue, Math.min(maxValue, parsedValue));
}
