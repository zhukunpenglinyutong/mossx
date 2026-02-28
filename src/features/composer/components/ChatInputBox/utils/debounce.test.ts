import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays execution until after the wait period', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('resets the timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    vi.advanceTimersByTime(80);
    debounced('b');
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('passes the latest arguments to the callback', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced('first');
    debounced('second');
    debounced('third');

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('third');
  });

  it('supports multiple arguments', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced('a', 'b');
    vi.advanceTimersByTime(50);

    expect(fn).toHaveBeenCalledWith('a', 'b');
  });

  describe('cancel', () => {
    it('prevents the pending callback from executing', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('a');
      vi.advanceTimersByTime(50);
      debounced.cancel();
      vi.advanceTimersByTime(100);

      expect(fn).not.toHaveBeenCalled();
    });

    it('is safe to call when nothing is pending', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      expect(() => debounced.cancel()).not.toThrow();
      expect(fn).not.toHaveBeenCalled();
    });

    it('allows new calls after cancellation', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      debounced('a');
      debounced.cancel();

      debounced('b');
      vi.advanceTimersByTime(50);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('b');
    });
  });

  describe('flush', () => {
    it('immediately executes the pending callback', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('a');
      debounced.flush();

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('a');
    });

    it('does not execute callback again after the original wait period', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('a');
      debounced.flush();
      vi.advanceTimersByTime(200);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('is safe to call when nothing is pending', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      expect(() => debounced.flush()).not.toThrow();
      expect(fn).not.toHaveBeenCalled();
    });

    it('uses the latest arguments when flushing', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('a');
      debounced('b');
      debounced('c');
      debounced.flush();

      expect(fn).toHaveBeenCalledWith('c');
    });
  });

  it('does not leak timers after cancel', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    debounced.cancel();

    // Advancing well past the wait should have no effect
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('does not leak timers after flush', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    debounced.flush();
    fn.mockClear();

    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
