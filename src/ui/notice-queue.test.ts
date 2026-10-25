import { describe, expect, it, vi } from 'vitest';
import { createNoticeQueue, readingTimeMs } from './notice-queue';

describe('notice lifetime and queue', () => {
  it('clamps reading time around 60 ms per character', () => {
    expect(readingTimeMs('')).toBe(4_000);
    expect(readingTimeMs('x'.repeat(50))).toBe(5_500);
    expect(readingTimeMs('x'.repeat(300))).toBe(12_000);
  });
  it('shows queued notices one at a time and resolves persistent notices', () => {
    const shown = vi.fn();
    const queue = createNoticeQueue(shown);
    queue.push({ text: 'one' }); queue.push({ text: 'two' });
    expect(queue.current?.text).toBe('one');
    queue.close(); expect(queue.current?.text).toBe('two');
    queue.push({ text: 'problem', persistent: true });
    expect(queue.current?.text).toBe('two');
    queue.resolve('problem');
    queue.close(); expect(queue.current).toBeNull();
  });
});
