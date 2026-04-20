/**
 * In-character toast queue. Shown at the bottom-center when something
 * noteworthy happens — a rename, a save, a death, a resync. Kept scarce on
 * purpose: every toast is a small jarring thing, so every one should earn it.
 */

import { tick } from 'svelte';

export type Toast = {
  id: number;
  text: string;
  tone: 'info' | 'grim' | 'ok';
};

let counter = 0;

class ToastStore {
  queue = $state<Toast[]>([]);

  push(text: string, tone: Toast['tone'] = 'info', ttlMs = 2400): void {
    counter += 1;
    const t: Toast = { id: counter, text, tone };
    this.queue = [...this.queue, t];
    if (typeof window !== 'undefined') {
      window.setTimeout(() => this.dismiss(t.id), ttlMs);
    }
  }

  async dismiss(id: number): Promise<void> {
    this.queue = this.queue.filter((x) => x.id !== id);
    await tick();
  }
}

export const toasts = new ToastStore();
