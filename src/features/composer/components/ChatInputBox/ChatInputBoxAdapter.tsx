/**
 * ChatInputBoxAdapter - Bridge between Composer.tsx props and ChatInputBox props
 *
 * This adapter translates the Composer's prop interface to ChatInputBox's interface,
 * enabling drop-in replacement of ComposerInput while maintaining 100% visual and
 * interaction consistency with idea-claude-code-gui's input box.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatInputBox } from './ChatInputBox';
import type {
  ChatInputBoxHandle,
  Attachment,
  ReasoningEffort,
  SelectedAgent,
  FileItem,
  CommandItem,
} from './types';
import type { QueuedMessage as ComposerQueuedMessage } from '../../../../types';
import type { CustomCommandOption } from '../../../../types';
import type { EngineType } from '../../../../types';
import { formatEngineVersionLabel } from '../../../engine/utils/engineLabels';

// Re-export the handle type for Composer to use
export type { ChatInputBoxHandle };

export interface ChatInputBoxAdapterProps {
  // Core state
  text: string;
  disabled?: boolean;
  isProcessing: boolean;
  canStop: boolean;

  // Callbacks
  onSend: () => void;
  onStop: () => void;
  onTextChange: (text: string, selectionStart: number | null) => void;

  // Model/Engine
  selectedModelId: string | null;
  selectedEngine?: EngineType;
  engines?: { type: EngineType; installed: boolean; version: string | null }[];
  onSelectEngine?: (engine: EngineType) => void;
  models?: { id: string; displayName: string; model: string }[];
  onSelectModel?: (id: string) => void;

  // Reasoning
  reasoningOptions?: string[];
  selectedEffort?: string | null;
  onSelectEffort?: (effort: string) => void;
  reasoningSupported?: boolean;

  // Attachments (string paths in Composer, Attachment objects in ChatInputBox)
  attachments?: string[];
  onAddAttachment?: () => void;
  onAttachImages?: (paths: string[]) => void;
  onRemoveAttachment?: (path: string) => void;

  // Height
  textareaHeight?: number;
  onHeightChange?: (height: number) => void;

  // Context usage
  contextUsage?: { used: number; total: number } | null;

  // Queue
  queuedMessages?: ComposerQueuedMessage[];
  onDeleteQueued?: (id: string) => void;

  // External keyboard handler (for Composer-level shortcuts)
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;

  // Autocomplete overlay props (rendered by Composer, positioned outside ChatInputBox)
  suggestionsOpen?: boolean;

  // Local completion data sources (from Composer)
  files?: string[];
  directories?: string[];
  commands?: CustomCommandOption[];

  // Header/context bar
  placeholder?: string;
  activeFile?: string;
  selectedLines?: string;
  onClearContext?: () => void;
  selectedAgent?: SelectedAgent | null;
  onAgentSelect?: (agent: SelectedAgent | null) => void;
  hasMessages?: boolean;
  onRewind?: () => void;
  statusPanelExpanded?: boolean;
  onToggleStatusPanel?: () => void;
}

/**
 * Adapts Composer's image path strings to ChatInputBox Attachment objects
 */
function pathsToAttachments(paths?: string[]): Attachment[] | undefined {
  if (!paths || paths.length === 0) return undefined;
  return paths.map((path, index) => ({
    id: `img-${index}-${path}`,
    fileName: path.split('/').pop() || path,
    mediaType: guessMediaType(path),
    data: path, // Store path as data since Tauri will handle file reading
  }));
}

function guessMediaType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };
  return map[ext] || 'image/png';
}

/**
 * Maps Composer engine types to ChatInputBox provider IDs
 */
type ChatInputProvider = 'claude' | 'codex' | 'gemini' | 'opencode';

function engineToProvider(engine?: EngineType): ChatInputProvider {
  switch (engine) {
    case 'codex':
      return 'codex';
    case 'opencode':
      return 'opencode';
    case 'gemini':
      return 'gemini';
    case 'claude':
    default:
      return 'claude';
  }
}

function providerToEngine(providerId: string): EngineType {
  switch (providerId) {
    case 'codex':
      return 'codex';
    case 'opencode':
      return 'opencode';
    case 'gemini':
      return 'gemini';
    case 'claude':
    default:
      return 'claude';
  }
}

/**
 * Maps Composer effort string to ChatInputBox ReasoningEffort type
 */
function effortToReasoning(effort?: string | null): ReasoningEffort {
  switch (effort) {
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    case 'xhigh':
    case 'max':
      return 'xhigh';
    default:
      return 'medium';
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, '');
}

function fileNameFromPath(path: string): string {
  const normalized = normalizePath(path);
  const segments = normalized.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : path;
}

function extensionFromFileName(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  if (idx <= 0 || idx >= fileName.length - 1) {
    return '';
  }
  return fileName.slice(idx + 1).toLowerCase();
}

export const ChatInputBoxAdapter = forwardRef<ChatInputBoxHandle, ChatInputBoxAdapterProps>(
  (props, ref) => {
    const {
      text,
      disabled,
      isProcessing,
      onTextChange,
      onSend,
      onStop,
      selectedModelId,
      selectedEngine,
      engines,
      onSelectEngine,
      onSelectModel,
      selectedEffort,
      onSelectEffort,
      attachments,
      onAddAttachment,
      onRemoveAttachment,
      contextUsage,
      queuedMessages,
      onDeleteQueued,
      files,
      directories,
      commands,
      placeholder,
      activeFile,
      selectedLines,
      onClearContext,
      selectedAgent,
      onAgentSelect,
      hasMessages,
      onRewind,
      statusPanelExpanded,
      onToggleStatusPanel,
    } = props;
    const { t } = useTranslation();
    const chatInputRef = useRef<ChatInputBoxHandle>(null);

    // Expose ChatInputBoxHandle to parent
    useImperativeHandle(ref, () => ({
      getValue: () => chatInputRef.current?.getValue() ?? '',
      setValue: (value: string) => chatInputRef.current?.setValue(value),
      focus: () => chatInputRef.current?.focus(),
      clear: () => chatInputRef.current?.clear(),
      hasContent: () => chatInputRef.current?.hasContent() ?? false,
      getFileTags: () => chatInputRef.current?.getFileTags() ?? [],
    }));

    // Sync external text changes to ChatInputBox
    const lastTextRef = useRef(text);
    useEffect(() => {
      if (text !== lastTextRef.current) {
        lastTextRef.current = text;
        chatInputRef.current?.setValue(text);
      }
    }, [text]);

    // Handle input from ChatInputBox -> Composer text state
    const handleInput = useCallback((content: string) => {
      lastTextRef.current = content;
      onTextChange(content, null);
    }, [onTextChange]);

    // Handle submit from ChatInputBox
    const handleSubmit = useCallback((_content: string, _attachments?: Attachment[]) => {
      onSend();
    }, [onSend]);

    // Handle attachment removal (convert Attachment id back to path)
    const handleRemoveAttachment = useCallback((id: string) => {
      // id format: "img-{index}-{path}"
      const path = id.replace(/^img-\d+-/, '');
      onRemoveAttachment?.(path);
    }, [onRemoveAttachment]);

    // Handle model selection (ChatInputBox sends model ID directly)
    const handleModelSelect = useCallback((modelId: string) => {
      onSelectModel?.(modelId);
    }, [onSelectModel]);

    // Handle reasoning effort change
    const handleReasoningChange = useCallback((effort: ReasoningEffort) => {
      onSelectEffort?.(effort);
    }, [onSelectEffort]);

    const handleProviderSelect = useCallback((providerId: string) => {
      const targetEngine = providerToEngine(providerId);
      if (targetEngine === selectedEngine) {
        return;
      }
      onSelectEngine?.(targetEngine);
    }, [onSelectEngine, selectedEngine]);

    // Convert context usage
    const usagePercentage = useMemo(() => {
      if (!contextUsage) return 0;
      const { used, total } = contextUsage;
      return total > 0 ? Math.round((used / total) * 100) : 0;
    }, [contextUsage]);

    // Convert queued messages (Composer uses text/createdAt, ChatInputBox uses content/queuedAt)
    const messageQueue = useMemo(() => {
      if (!queuedMessages) return undefined;
      return queuedMessages.map(q => ({
        id: q.id,
        content: q.text,
        queuedAt: q.createdAt,
      }));
    }, [queuedMessages]);

    const completionFiles = useMemo<FileItem[]>(() => {
      const directoryItems: FileItem[] = (directories ?? []).map((path) => {
        const normalizedPath = `${normalizePath(path)}/`;
        const name = fileNameFromPath(path);
        return {
          name,
          path: normalizedPath,
          absolutePath: normalizedPath,
          type: 'directory',
          extension: '',
        };
      });

      const fileItems: FileItem[] = (files ?? []).map((path) => {
        const normalizedPath = normalizePath(path);
        const name = fileNameFromPath(path);
        return {
          name,
          path: normalizedPath,
          absolutePath: normalizedPath,
          type: 'file',
          extension: extensionFromFileName(name),
        };
      });

      return [...directoryItems, ...fileItems];
    }, [directories, files]);

    const fileCompletionProvider = useCallback(
      async (query: string, signal: AbortSignal): Promise<FileItem[]> => {
        if (signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
          return completionFiles.slice(0, 500);
        }
        return completionFiles
          .filter((item) => {
            const name = item.name.toLowerCase();
            const path = item.path.toLowerCase();
            return name.includes(normalizedQuery) || path.includes(normalizedQuery);
          })
          .slice(0, 500);
      },
      [completionFiles],
    );

    const builtinSlashCommands = useMemo<CommandItem[]>(() => [
      { id: 'clear', label: '/clear', description: t('chat.commands.clear'), category: 'system' },
      { id: 'new', label: '/new', description: t('chat.commands.new'), category: 'system' },
      { id: 'status', label: '/status', description: t('chat.commands.status'), category: 'session' },
      { id: 'resume', label: '/resume', description: t('chat.commands.resume'), category: 'session' },
      { id: 'review', label: '/review', description: t('chat.commands.review'), category: 'workflow' },
      { id: 'fork', label: '/fork', description: t('chat.commands.fork'), category: 'workflow' },
      { id: 'mcp', label: '/mcp', description: t('chat.commands.mcp'), category: 'tooling' },
      { id: 'export', label: '/export', description: t('chat.commands.export'), category: 'session' },
      { id: 'import', label: '/import', description: t('chat.commands.import'), category: 'session' },
      { id: 'lsp', label: '/lsp', description: t('chat.commands.lsp'), category: 'tooling' },
    ], [t]);

    const completionCommands = useMemo<CommandItem[]>(() => {
      const customCommands: CommandItem[] = (commands ?? [])
        .filter((entry) => entry.name.trim().length > 0)
        .map((entry) => {
          const cleanName = entry.name.trim().replace(/^\//, '');
          return {
            id: cleanName,
            label: `/${cleanName}`,
            description: entry.description || '',
            category: 'custom',
          };
        });

      const seen = new Set<string>();
      const merged = [...builtinSlashCommands, ...customCommands].filter((entry) => {
        const key = entry.label.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
      return merged;
    }, [commands, builtinSlashCommands]);

    const providerAvailability = useMemo(() => {
      if (!engines || engines.length === 0) {
        return undefined;
      }
      const installedEngines = new Set(
        (engines ?? [])
          .filter((entry) => entry.installed)
          .map((entry) => String(entry.type)),
      );
      return {
        claude: installedEngines.has('claude'),
        codex: installedEngines.has('codex'),
        opencode: installedEngines.has('opencode'),
        gemini: installedEngines.has('gemini'),
      } as const;
    }, [engines]);

    const providerVersions = useMemo(() => {
      if (!engines || engines.length === 0) {
        return undefined;
      }

      const engineDisplayName: Record<EngineType, string> = {
        claude: 'Claude Code',
        codex: 'Codex CLI',
        gemini: 'Gemini CLI',
        opencode: 'OpenCode',
      };

      const byEngine = new Map(engines.map((entry) => [entry.type, entry]));
      const resolveVersion = (engineType: EngineType) => {
        const engine = byEngine.get(engineType);
        if (!engine?.version) {
          return null;
        }
        return formatEngineVersionLabel({
          type: engineType,
          displayName: engineDisplayName[engineType],
          shortName: engineDisplayName[engineType],
          installed: engine.installed,
          version: engine.version,
          error: null,
        });
      };

      return {
        claude: resolveVersion('claude'),
        codex: resolveVersion('codex'),
        opencode: resolveVersion('opencode'),
        gemini: resolveVersion('gemini'),
      } as const;
    }, [engines]);

    const commandCompletionProvider = useCallback(
      async (query: string, signal: AbortSignal): Promise<CommandItem[]> => {
        if (signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
          return completionCommands;
        }
        return completionCommands.filter((entry) => {
          const label = entry.label.toLowerCase();
          const id = entry.id.toLowerCase();
          const description = entry.description?.toLowerCase() ?? '';
          return (
            label.includes(normalizedQuery) ||
            id.includes(normalizedQuery) ||
            description.includes(normalizedQuery)
          );
        });
      },
      [completionCommands],
    );

    return (
      <ChatInputBox
        ref={chatInputRef}
        isLoading={isProcessing}
        disabled={disabled}
        value={text}
        placeholder={placeholder ?? t('chat.inputPlaceholder')}
        selectedModel={selectedModelId ?? 'claude-sonnet-4-6'}
        currentProvider={engineToProvider(selectedEngine)}
        providerAvailability={providerAvailability}
        providerVersions={providerVersions}
        activeFile={activeFile}
        selectedLines={selectedLines}
        onClearContext={onClearContext}
        onSubmit={handleSubmit}
        onStop={onStop}
        onInput={handleInput}
        attachments={pathsToAttachments(attachments)}
        onAddAttachment={onAddAttachment ? (_files: FileList) => {
          // In Tauri, we use the native file picker instead of FileList
          onAddAttachment?.();
        } : undefined}
        onRemoveAttachment={handleRemoveAttachment}
        onModelSelect={handleModelSelect}
        onProviderSelect={onSelectEngine ? handleProviderSelect : undefined}
        reasoningEffort={effortToReasoning(selectedEffort)}
        onReasoningChange={onSelectEffort ? handleReasoningChange : undefined}
        selectedAgent={selectedAgent}
        onAgentSelect={onAgentSelect}
        onClearAgent={onAgentSelect ? () => onAgentSelect?.(null) : undefined}
        hasMessages={hasMessages}
        onRewind={onRewind}
        statusPanelExpanded={statusPanelExpanded}
        onToggleStatusPanel={onToggleStatusPanel}
        usagePercentage={usagePercentage}
        usageUsedTokens={contextUsage?.used}
        usageMaxTokens={contextUsage?.total}
        showUsage={true}
        messageQueue={messageQueue}
        onRemoveFromQueue={onDeleteQueued}
        sdkInstalled={true}
        fileCompletionProvider={fileCompletionProvider}
        commandCompletionProvider={commandCompletionProvider}
      />
    );
  }
);

ChatInputBoxAdapter.displayName = 'ChatInputBoxAdapter';
