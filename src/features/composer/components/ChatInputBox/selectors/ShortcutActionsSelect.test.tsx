// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShortcutActionsSelect } from './ShortcutActionsSelect';
import type { ShortcutAction } from '../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'chat.shortcutActionsEntry': 'Shortcuts',
        'chat.shortcutActionsAriaLabel': 'Quick input actions',
      };
      return translations[key] ?? key;
    },
  }),
}));

describe('ShortcutActionsSelect', () => {
  afterEach(() => {
    cleanup();
  });

  it('supports keyboard navigation and close behavior', async () => {
    const onFile = vi.fn();
    const onPrompt = vi.fn();
    const actions: ShortcutAction[] = [
      { key: 'file', trigger: '@', label: 'Reference file', onClick: onFile },
      { key: 'prompt', trigger: '!', label: 'Insert prompt', onClick: onPrompt },
    ];

    render(<ShortcutActionsSelect actions={actions} />);

    const trigger = screen.getByRole('button', { name: 'Shortcuts' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const menu = await screen.findByRole('menu', { name: 'Quick input actions' });
    expect(menu).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    const fileItem = screen.getByRole('menuitem', { name: /Reference file/ });
    const promptItem = screen.getByRole('menuitem', { name: /Insert prompt/ });

    await waitFor(() => {
      expect(document.activeElement).toBe(fileItem);
    });

    fireEvent.keyDown(fileItem, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(promptItem);

    fireEvent.keyDown(promptItem, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: 'Quick input actions' })).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('runs selected shortcut action from menu item click', async () => {
    const onPrompt = vi.fn();
    const actions: ShortcutAction[] = [
      { key: 'prompt', trigger: '!', label: 'Insert prompt', onClick: onPrompt },
    ];

    render(<ShortcutActionsSelect actions={actions} />);

    fireEvent.click(screen.getByRole('button', { name: 'Shortcuts' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Insert prompt/ }));

    expect(onPrompt).toHaveBeenCalledTimes(1);
  });
});
