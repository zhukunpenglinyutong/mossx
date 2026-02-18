export type OpenCodeModelBadge = {
  label: string;
  tone: "neutral" | "good" | "warn";
};

function parseContextWindow(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.includes("-128k") || lower.includes("128k")) return "128k";
  if (lower.includes("-200k") || lower.includes("200k")) return "200k";
  if (lower.includes("-1m") || lower.includes("1m")) return "1M";
  if (lower.includes("-2m") || lower.includes("2m")) return "2M";
  return "std";
}

function inferSpeed(modelId: string): OpenCodeModelBadge {
  const lower = modelId.toLowerCase();
  if (lower.includes("nano") || lower.includes("mini") || lower.includes("spark")) {
    return { label: "Fast", tone: "good" };
  }
  if (lower.includes("max") || lower.includes("pro") || lower.includes("opus")) {
    return { label: "Slow", tone: "warn" };
  }
  return { label: "Balanced", tone: "neutral" };
}

function inferCost(modelId: string): OpenCodeModelBadge {
  const lower = modelId.toLowerCase();
  if (lower.includes("nano") || lower.includes("mini") || lower.includes("spark") || lower.includes("free")) {
    return { label: "Low $", tone: "good" };
  }
  if (lower.includes("max") || lower.includes("pro") || lower.includes("opus")) {
    return { label: "High $", tone: "warn" };
  }
  return { label: "Mid $", tone: "neutral" };
}

export function inferOpenCodeModelBadges(modelIdOrName: string): OpenCodeModelBadge[] {
  const text = (modelIdOrName || "").trim();
  if (!text) {
    return [
      { label: "Balanced", tone: "neutral" },
      { label: "Mid $", tone: "neutral" },
      { label: "std", tone: "neutral" },
    ];
  }
  const speed = inferSpeed(text);
  const cost = inferCost(text);
  return [
    speed,
    cost,
    { label: parseContextWindow(text), tone: "neutral" },
  ];
}
