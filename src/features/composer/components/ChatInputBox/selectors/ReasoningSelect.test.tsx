// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReasoningSelect } from './ReasoningSelect';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

describe('ReasoningSelect', () => {
  it('does not fall back to all levels when explicit options are empty', () => {
    render(
      <ReasoningSelect
        value={null}
        onChange={vi.fn()}
        options={[]}
        showDefaultOption
        defaultLabel="Claude 默认"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Claude 默认/i }));

    expect(screen.getAllByText('Claude 默认')).toHaveLength(2);
    expect(screen.queryByText('Low')).toBeNull();
    expect(screen.queryByText('Medium')).toBeNull();
    expect(screen.queryByText('High')).toBeNull();
    expect(screen.queryByText('Extra High')).toBeNull();
    expect(screen.queryByText('Max')).toBeNull();
  });
});
