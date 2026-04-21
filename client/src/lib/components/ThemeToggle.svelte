<script lang="ts">
  import { onMount } from 'svelte';

  type Mode = 'auto' | 'light' | 'dark';

  const ORDER: Mode[] = ['auto', 'dark', 'light'];
  const LABELS: Record<Mode, string> = {
    auto: 'Auto',
    dark: 'Dark',
    light: 'Light'
  };

  let mode = $state<Mode>('auto');

  onMount(() => {
    try {
      const saved = localStorage.getItem('cc.theme');
      if (saved === 'dark' || saved === 'light') mode = saved;
      else mode = 'auto';
    } catch {}
  });

  function apply(m: Mode) {
    if (typeof document === 'undefined') return;
    if (m === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', m);
    try {
      if (m === 'auto') localStorage.removeItem('cc.theme');
      else localStorage.setItem('cc.theme', m);
    } catch {}
  }

  function cycle() {
    const idx = ORDER.indexOf(mode);
    const next = ORDER[(idx + 1) % ORDER.length] ?? 'auto';
    mode = next;
    apply(next);
  }
</script>

<button
  type="button"
  class="theme-toggle"
  onclick={cycle}
  aria-label="Theme: {LABELS[mode]} — click to cycle"
  title="Theme: {LABELS[mode]}"
>
  <span class="indicator" data-mode={mode} aria-hidden="true">
    {#if mode === 'dark'}
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3a9 9 0 0 0 0 18c4 0 7.5-2.6 8.6-6.3a7 7 0 0 1-8.3-8.3C12.2 5.2 12.1 4.1 12 3z"/></svg>
    {:else if mode === 'light'}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="currentColor"/>
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 0 18V3z"/>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    {/if}
  </span>
  <span class="label">{LABELS[mode]}</span>
</button>

<style>
  .theme-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-1) var(--s-3);
    border: 0;
    background: transparent;
    color: var(--fg);
    font-family: var(--font-head);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    border-radius: 0;
    min-height: 32px;
  }
  .theme-toggle:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .theme-toggle:focus-visible {
    outline: var(--ring) solid var(--accent-bright);
    outline-offset: 2px;
  }
  .indicator {
    display: inline-flex;
    width: 16px;
    height: 16px;
  }
  .indicator svg {
    width: 100%;
    height: 100%;
  }
  .indicator[data-mode='auto'] { color: var(--brass); }
  .indicator[data-mode='dark'] { color: var(--fg-mute); }
  .indicator[data-mode='light'] { color: var(--accent-bright); }
</style>
