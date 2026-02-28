// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockState = vi.hoisted(() => ({
  latestProps: null as Record<string, unknown> | null,
  getClaudeProviders: vi.fn(),
  getClaudeAlwaysThinkingEnabled: vi.fn(),
  setClaudeAlwaysThinkingEnabled: vi.fn(),
  updateClaudeProvider: vi.fn(),
  switchClaudeProvider: vi.fn(),
}));

vi.mock('./ChatInputBox', async () => {
  const React = await import('react');
  const MockChatInputBox = React.forwardRef((props: Record<string, unknown>, ref) => {
    mockState.latestProps = props;
    React.useImperativeHandle(ref, () => ({
      getValue: () => '',
      setValue: () => {},
      focus: () => {},
      clear: () => {},
      hasContent: () => false,
      getFileTags: () => [],
    }));
    return <div data-testid="mock-chat-input-box" />;
  });
  MockChatInputBox.displayName = 'MockChatInputBox';
  return { ChatInputBox: MockChatInputBox };
});

vi.mock('../../../../services/tauri', () => ({
  getClaudeProviders: mockState.getClaudeProviders,
  getClaudeAlwaysThinkingEnabled: mockState.getClaudeAlwaysThinkingEnabled,
  setClaudeAlwaysThinkingEnabled: mockState.setClaudeAlwaysThinkingEnabled,
  updateClaudeProvider: mockState.updateClaudeProvider,
  switchClaudeProvider: mockState.switchClaudeProvider,
}));

import { ChatInputBoxAdapter } from './ChatInputBoxAdapter';

function renderAdapter(
  overrides: Partial<ComponentProps<typeof ChatInputBoxAdapter>> = {},
) {
  return render(
    <ChatInputBoxAdapter
      text=""
      isProcessing={false}
      canStop={false}
      selectedModelId="claude-sonnet-4-6"
      onSend={() => {}}
      onStop={() => {}}
      onTextChange={() => {}}
      selectedEngine="claude"
      {...overrides}
    />,
  );
}

describe('ChatInputBoxAdapter toggle bridge', () => {
  beforeEach(() => {
    mockState.latestProps = null;
    mockState.getClaudeProviders.mockReset().mockResolvedValue([
      {
        id: 'provider-1',
        name: 'Claude',
        isActive: true,
        settingsConfig: { alwaysThinkingEnabled: false },
      },
    ]);
    mockState.getClaudeAlwaysThinkingEnabled.mockReset().mockResolvedValue(false);
    mockState.setClaudeAlwaysThinkingEnabled.mockReset().mockResolvedValue(undefined);
    mockState.updateClaudeProvider.mockReset().mockResolvedValue(undefined);
    mockState.switchClaudeProvider.mockReset().mockResolvedValue(undefined);
    window.localStorage.clear();
  });

  it('provides internal thinking and streaming handlers by default', async () => {
    renderAdapter();

    await waitFor(() => expect(mockState.latestProps).toBeTruthy());

    const latest = mockState.latestProps as {
      alwaysThinkingEnabled?: boolean;
      streamingEnabled?: boolean;
      onToggleThinking?: (enabled: boolean) => void | Promise<void>;
      onStreamingEnabledChange?: (enabled: boolean) => void;
    };

    await waitFor(() => expect(latest.alwaysThinkingEnabled).toBe(false));
    expect(latest.streamingEnabled).toBe(true);
    expect(typeof latest.onToggleThinking).toBe('function');
    expect(typeof latest.onStreamingEnabledChange).toBe('function');

    await act(async () => {
      await Promise.resolve(latest.onToggleThinking?.(true));
    });

    expect(mockState.updateClaudeProvider).toHaveBeenCalledTimes(1);
    expect(mockState.switchClaudeProvider).toHaveBeenCalledWith('provider-1');
    expect(mockState.updateClaudeProvider).toHaveBeenCalledWith(
      'provider-1',
      expect.objectContaining({
        settingsConfig: expect.objectContaining({
          alwaysThinkingEnabled: true,
        }),
      }),
    );

    act(() => {
      latest.onStreamingEnabledChange?.(false);
    });
    expect(window.localStorage.getItem('mossx.composer.streaming-enabled')).toBe('0');
  });

  it('uses external thinking callback when supplied', async () => {
    const onToggleThinking = vi.fn();
    renderAdapter({
      alwaysThinkingEnabled: true,
      onToggleThinking,
    });

    await waitFor(() => expect(mockState.latestProps).toBeTruthy());

    const latest = mockState.latestProps as {
      onToggleThinking?: (enabled: boolean) => void | Promise<void>;
    };
    await act(async () => {
      await Promise.resolve(latest.onToggleThinking?.(false));
    });

    expect(onToggleThinking).toHaveBeenCalledWith(false);
    expect(mockState.updateClaudeProvider).not.toHaveBeenCalled();
    expect(mockState.switchClaudeProvider).not.toHaveBeenCalled();
  });

  it('falls back to direct claude settings when no active provider exists', async () => {
    mockState.getClaudeProviders.mockResolvedValue([]);
    mockState.getClaudeAlwaysThinkingEnabled.mockResolvedValue(true);

    renderAdapter();

    await waitFor(() => expect(mockState.latestProps).toBeTruthy());
    const latest = mockState.latestProps as {
      alwaysThinkingEnabled?: boolean;
      onToggleThinking?: (enabled: boolean) => void | Promise<void>;
    };

    await waitFor(() => expect(latest.alwaysThinkingEnabled).toBe(true));

    await act(async () => {
      await Promise.resolve(latest.onToggleThinking?.(false));
    });

    expect(mockState.updateClaudeProvider).not.toHaveBeenCalled();
    expect(mockState.switchClaudeProvider).not.toHaveBeenCalled();
    expect(mockState.setClaudeAlwaysThinkingEnabled).toHaveBeenCalledWith(false);
  });
});
