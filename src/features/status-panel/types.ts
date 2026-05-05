export type SubagentNavigationTarget =
  | {
      kind: "thread";
      threadId: string;
    }
  | {
      kind: "claude-task";
      taskId?: string | null;
      toolUseId?: string | null;
    };

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
  navigationTarget?: SubagentNavigationTarget | null;
}

export interface FileChangeSummary {
  filePath: string;
  fileName: string;
  status: "A" | "D" | "R" | "M";
  additions: number;
  deletions: number;
  diff?: string;
}

export interface CommandSummary {
  id: string;
  command: string;
  status: "running" | "completed" | "error";
}

export type TabType = "todo" | "subagent" | "files" | "plan" | "command" | "latestUserMessage";
