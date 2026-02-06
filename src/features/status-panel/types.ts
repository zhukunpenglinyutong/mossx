export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

export interface SubagentInfo {
  id: string;
  type: string;
  description: string;
  status: "running" | "completed" | "error";
}

export interface FileChangeSummary {
  filePath: string;
  fileName: string;
  status: "A" | "M";
}

export type TabType = "todo" | "subagent" | "files";
