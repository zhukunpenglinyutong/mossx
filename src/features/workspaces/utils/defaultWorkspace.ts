export function normalizeWorkspacePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function isDefaultWorkspacePath(path: string): boolean {
  const normalized = normalizeWorkspacePath(path);
  return (
    normalized.includes("/.mossx/workspace") ||
    normalized.includes("/.codemoss/workspace") ||
    normalized.includes("/com.zhukunpenglinyutong.mossx/workspace") ||
    normalized.includes("/com.zhukunpenglinyutong.codemoss/workspace")
  );
}
