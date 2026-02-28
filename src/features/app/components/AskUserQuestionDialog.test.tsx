// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { AskUserQuestionDialog } from './AskUserQuestionDialog';
import type { RequestUserInputRequest } from '../../../types';

function makeRequest(
  overrides: Partial<RequestUserInputRequest> & {
    questions?: RequestUserInputRequest['params']['questions'];
    threadId?: string;
  } = {},
): RequestUserInputRequest {
  const {
    questions = [
      {
        id: 'q1',
        header: 'Header',
        question: 'Pick one',
        options: [
          { label: 'Option A', description: 'Desc A' },
          { label: 'Option B', description: 'Desc B' },
        ],
      },
    ],
    threadId = 'thread-1',
    ...rest
  } = overrides;

  return {
    workspace_id: 'ws-1',
    request_id: 1,
    params: {
      thread_id: threadId,
      turn_id: 'turn-1',
      item_id: 'item-1',
      questions,
    },
    ...rest,
  };
}

type Props = ComponentProps<typeof AskUserQuestionDialog>;

function renderDialog(overrides: Partial<Props> = {}) {
  const defaultProps: Props = {
    requests: [makeRequest()],
    activeThreadId: 'thread-1',
    onSubmit: vi.fn(),
    ...overrides,
  };
  return { ...render(<AskUserQuestionDialog {...defaultProps} />), props: defaultProps };
}

describe('AskUserQuestionDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders nothing when requests array is empty', () => {
    const { container } = renderDialog({ requests: [] });
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when activeThreadId does not match', () => {
    const { container } = renderDialog({ activeThreadId: 'other-thread' });
    expect(container.innerHTML).toBe('');
  });

  it('renders overlay and question text for active request', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Pick one')).toBeTruthy();
  });

  it('renders option labels', () => {
    renderDialog();
    expect(screen.getByText('Option A')).toBeTruthy();
    expect(screen.getByText('Option B')).toBeTruthy();
  });

  it('selects an option on click and replaces selection on another click', () => {
    renderDialog();

    const optionA = screen.getByText('Option A').closest('button')!;
    const optionB = screen.getByText('Option B').closest('button')!;

    fireEvent.click(optionA);
    expect(optionA.classList.contains('is-selected')).toBe(true);

    // Clicking Option B should deselect A (single-select mode)
    fireEvent.click(optionB);
    expect(optionB.classList.contains('is-selected')).toBe(true);
    expect(optionA.classList.contains('is-selected')).toBe(false);
  });

  it('shows "Next" for non-last question and advances on click', () => {
    const twoQuestions: RequestUserInputRequest['params']['questions'] = [
      {
        id: 'q1',
        header: '',
        question: 'First question',
        options: [{ label: 'A', description: '' }],
      },
      {
        id: 'q2',
        header: '',
        question: 'Second question',
        options: [{ label: 'B', description: '' }],
      },
    ];

    renderDialog({ requests: [makeRequest({ questions: twoQuestions })] });

    // Should show "Next" button (not "Submit")
    expect(screen.getByText('askUserQuestion.next')).toBeTruthy();

    // Select an option to enable "Next"
    fireEvent.click(screen.getByText('A').closest('button')!);
    fireEvent.click(screen.getByText('askUserQuestion.next'));

    // Now second question should be visible
    expect(screen.getByText('Second question')).toBeTruthy();
    // And button should now say "Submit"
    expect(screen.getByText('askUserQuestion.submit')).toBeTruthy();
  });

  it('calls onSubmit when clicking Submit on last question', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onSubmit });

    // Select an option
    fireEvent.click(screen.getByText('Option A').closest('button')!);

    // Click submit
    fireEvent.click(screen.getByText('askUserQuestion.submit'));

    await vi.runAllTimersAsync();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ request_id: 1 }),
      expect.objectContaining({ answers: expect.any(Object) }),
    );
  });

  it('collapses and expands the dialog', () => {
    renderDialog();

    // Find collapse button
    const collapseBtn = screen.getByTitle('askUserQuestion.collapse');
    fireEvent.click(collapseBtn);

    // When collapsed, the question body should be hidden, collapsed hint visible
    expect(screen.getByText('askUserQuestion.clickToAnswer')).toBeTruthy();
    expect(screen.queryByText('Pick one')).toBeNull();

    // Expand by clicking the expand button
    const expandBtn = screen.getByTitle('askUserQuestion.expand');
    fireEvent.click(expandBtn);

    // Question text should be visible again
    expect(screen.getByText('Pick one')).toBeTruthy();
  });

  it('calls onSubmit with empty answers when cancel is clicked', () => {
    const onSubmit = vi.fn();
    renderDialog({ onSubmit });

    fireEvent.click(screen.getByText('askUserQuestion.cancel'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ request_id: 1 }),
      { answers: {} },
    );
  });

  it('renders a textarea for plain text question (no options)', () => {
    const plainTextQ: RequestUserInputRequest['params']['questions'] = [
      { id: 'q1', header: '', question: 'Type something' },
    ];
    renderDialog({ requests: [makeRequest({ questions: plainTextQ })] });

    const textarea = screen.getByPlaceholderText('approval.typeAnswerOptional');
    expect(textarea).toBeTruthy();
    expect(textarea.tagName.toLowerCase()).toBe('textarea');
  });
});
