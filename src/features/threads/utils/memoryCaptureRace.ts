export function shouldMergeOnInputCapture(
  pendingAssistantCompletedAt: number | null,
  nowMs: number,
  staleMs: number,
): boolean {
  if (pendingAssistantCompletedAt === null) {
    return false;
  }
  return nowMs - pendingAssistantCompletedAt <= staleMs;
}

export function shouldMergeOnAssistantCompleted(
  pendingInputCapturedAt: number | null,
  nowMs: number,
  staleMs: number,
): boolean {
  if (pendingInputCapturedAt === null) {
    return false;
  }
  return nowMs - pendingInputCapturedAt <= staleMs;
}
