// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { ChatInputBoxFooter } from './ChatInputBoxFooter';
import type { DropdownItemData } from './types';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => path,
}));

vi.mock('./ButtonArea.js', () => ({
  ButtonArea: () => <div data-testid="button-area" />,
}));

vi.mock('./PromptEnhancerDialog.js', () => ({
  PromptEnhancerDialog: () => null,
}));

vi.mock('../../../../components/common/LocalImage', () => ({
  LocalImage: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

function closedCompletion(overrides = {}) {
  return {
    isOpen: false,
    position: null,
    items: [] as DropdownItemData[],
    activeIndex: 0,
    loading: false,
    close: vi.fn(),
    selectIndex: vi.fn(),
    handleMouseEnter: vi.fn(),
    ...overrides,
  };
}

const testT = ((key: string, params?: Record<string, string | number>) => {
  if (key === 'composer.manualMemoryPickerInputTitle') {
    return `User input: ${params?.query ?? ''}`;
  }
  if (key === 'composer.manualMemoryPickerSelectedCount') {
    return `${params?.count ?? 0} selected`;
  }
  if (key === 'composer.manualMemoryPickerShortcutSelect') {
    return 'Enter to select';
  }
  if (key === 'memory.empty') {
    return 'No memories';
  }
  return key;
}) as unknown as TFunction;

function renderFooter(memoryItems: DropdownItemData[]) {
  return render(
    <ChatInputBoxFooter
      disabled={false}
      hasInputContent={false}
      isLoading={false}
      isEnhancing={false}
      selectedModel="model"
      permissionMode="bypassPermissions"
      currentProvider="claude"
      reasoningEffort={null}
      onSubmit={() => {}}
      onEnhancePrompt={() => {}}
      sendShortcut="enter"
      onClearAgent={() => {}}
      fileCompletion={closedCompletion()}
      memoryCompletion={closedCompletion({
        isOpen: true,
        position: { top: 320, left: 24, width: 480, height: 24 },
        items: memoryItems,
        triggerQuery: { trigger: '@@', query: '发布', start: 0, end: 4 },
      })}
      noteCardCompletion={closedCompletion()}
      commandCompletion={closedCompletion()}
      skillCompletion={closedCompletion()}
      agentCompletion={closedCompletion()}
      promptCompletion={closedCompletion()}
      tooltip={null}
      promptEnhancer={{
        isOpen: false,
        isLoading: false,
        loadingEngine: 'claude',
        originalPrompt: '',
        enhancedPrompt: '',
        canUseEnhanced: false,
        onUseEnhanced: () => {},
        onKeepOriginal: () => {},
        onClose: () => {},
      }}
      t={testT}
    />,
  );
}

describe('ChatInputBoxFooter manual memory picker', () => {
  it('renders compact left preview while preserving full right detail', () => {
    const fullAssistantOutput = 'FULL_ASSISTANT_OUTPUT_ONLY_IN_RIGHT_DETAIL';
    const memoryItems: DropdownItemData[] = [
      {
        id: 'memory:m-1',
        label: 'Fallback title',
        type: 'info',
        data: {
          id: 'm-1',
          title: 'Fallback title',
          summary: 'Fallback summary',
          detail: [
            '用户输入：发布流程怎么走',
            '助手输出摘要：先构建，再 smoke test。',
            `助手输出：${fullAssistantOutput}`,
          ].join('\n'),
          kind: 'conversation',
          importance: 'high',
          updatedAt: 1_700_000_000_000,
          tags: ['release'],
        },
      },
    ];

    const view = renderFooter(memoryItems);
    const option = screen.getByRole('option', { name: /发布流程怎么走/ });

    expect(within(option).getByText('发布流程怎么走')).toBeTruthy();
    expect(within(option).getByText('先构建，再 smoke test。')).toBeTruthy();
    expect(within(option).queryByText(fullAssistantOutput)).toBeNull();
    expect(view.container.textContent).toContain(fullAssistantOutput);
  });
});
