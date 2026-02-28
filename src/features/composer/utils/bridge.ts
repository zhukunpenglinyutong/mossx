/**
 * Bridge adapter for codemoss (Tauri environment)
 * Replaces idea-claude's Java bridge with no-op implementations.
 * These functions will be connected to Tauri IPC in the future.
 */

export const sendBridgeEvent = (_event: string, _content = ''): boolean => {
  // No-op in Tauri environment
  return false;
};

export const openFile = (_filePath?: string): void => {
  // TODO: Connect to Tauri's file opening command
};

export const openBrowser = (_url?: string): void => {
  // TODO: Connect to Tauri's shell.open
};

export const sendToJava = (_message: string, _payload: Record<string, unknown> | string = {}): void => {
  // No-op in Tauri environment
};

export const refreshFile = (_filePath: string): void => {};

export const showDiff = (
  _filePath: string,
  _oldContent: string,
  _newContent: string,
  _title?: string
): void => {};

export const showMultiEditDiff = (
  _filePath: string,
  _edits: Array<{ oldString: string; newString: string; replaceAll?: boolean }>,
  _currentContent?: string
): void => {};

export const showEditableDiff = (
  _filePath: string,
  _operations: Array<{ oldString: string; newString: string; replaceAll?: boolean }>,
  _status: 'A' | 'M'
): void => {};

export const showEditPreviewDiff = (
  _filePath: string,
  _edits: Array<{ oldString: string; newString: string; replaceAll?: boolean }>,
  _title?: string
): void => {};

export const showEditFullDiff = (
  _filePath: string,
  _oldString: string,
  _newString: string,
  _originalContent?: string,
  _replaceAll?: boolean,
  _title?: string
): void => {};

export const showInteractiveDiff = (
  _filePath: string,
  _newFileContents: string,
  _tabName?: string,
  _isNewFile?: boolean
): void => {};

export const rewindFiles = (_sessionId: string, _userMessageId: string): void => {};

export const undoFileChanges = (
  _filePath: string,
  _status: 'A' | 'M',
  _operations: Array<{ oldString: string; newString: string; replaceAll?: boolean }>
): void => {};
