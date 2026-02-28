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
  additions: number;
  deletions: number;
}

export interface CommandSummary {
  id: string;
  command: string;
  status: "running" | "completed" | "error";
}

export type TabType = "todo" | "subagent" | "files" | "plan" | "command";
