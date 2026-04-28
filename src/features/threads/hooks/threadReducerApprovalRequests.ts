import type { ApprovalRequest } from "../../../types";

function stableSerializeApprovalValue(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerializeApprovalValue(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableSerializeApprovalValue(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function isSameApprovalRequest(
  left: ApprovalRequest,
  right: ApprovalRequest,
) {
  return (
    left.workspace_id === right.workspace_id &&
    left.request_id === right.request_id &&
    left.method === right.method &&
    stableSerializeApprovalValue(left.params ?? {}) ===
      stableSerializeApprovalValue(right.params ?? {})
  );
}
