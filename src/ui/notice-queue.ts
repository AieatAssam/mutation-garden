export function readingTimeMs(text: string): number {
  return Math.min(12_000, Math.max(4_000, 2_500 + 60 * text.length));
}

export interface Notice { readonly text: string; readonly persistent?: boolean }

export function createNoticeQueue(onShow: (notice: Notice | null) => void) {
  let current: Notice | null = null;
  const pending: Notice[] = [];
  return {
    push(notice: Notice) {
      if (!current) { current = notice; onShow(current); }
      else pending.push(notice);
    },
    close() { current = pending.shift() ?? null; onShow(current); },
    resolve(text: string) {
      if (current?.text === text) this.close();
      else {
        const index = pending.findIndex((notice) => notice.text === text);
        if (index >= 0) pending.splice(index, 1);
      }
    },
    get current() { return current; },
  };
}
