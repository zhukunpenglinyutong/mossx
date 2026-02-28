/**
 * Prompt library configuration (from idea-claude-code-gui)
 */
export interface PromptConfig {
  id: string;
  name: string;
  content: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface PromptOperationResult {
  success: boolean;
  operation: 'add' | 'update' | 'delete';
  error?: string;
}
