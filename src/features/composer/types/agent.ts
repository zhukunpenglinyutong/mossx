/**
 * Agent configuration (from idea-claude-code-gui)
 */
export interface AgentConfig {
  id: string;
  name: string;
  prompt?: string;
  createdAt?: number;
}

export interface AgentOperationResult {
  success: boolean;
  operation: 'add' | 'update' | 'delete';
  error?: string;
}
