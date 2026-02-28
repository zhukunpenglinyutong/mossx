/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

// Window extensions for ChatInputBox Java bridge interop (idea-claude compatibility)
interface Window {
  handleFilePathFromJava?: (filePathInput: string | string[]) => void;
  insertCodeSnippetAtCursor?: (selectionInfo: string) => void;
  updateAgents?: (json: string) => void;
  onFileListResult?: (json: string) => void;
  updatePrompts?: (json: string) => void;
  updateSlashCommands?: (json: string) => void;
  __pendingSlashCommands?: string;
  sendToJava?: (message: string) => void;
}
