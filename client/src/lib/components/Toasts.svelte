<script lang="ts">
  import { toasts } from '$lib/toasts.svelte';
</script>

<div class="tray" aria-live="polite" aria-atomic="false">
  {#each toasts.queue as t (t.id)}
    <div class="toast" data-tone={t.tone}>{t.text}</div>
  {/each}
</div>

<style>
  .tray {
    position: fixed;
    bottom: var(--s-8);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column-reverse;
    gap: var(--s-2);
    z-index: 60;
    pointer-events: none;
  }
  .toast {
    padding: var(--s-3) var(--s-5);
    background: var(--fg);
    color: var(--bg);
    border: var(--stroke-heavy) solid var(--accent-dark);
    font-family: var(--font-head);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 0.85rem;
    box-shadow: none;
    animation: toast-in 160ms ease-out;
  }
  .toast[data-tone='grim'] {
    background: var(--accent);
    color: var(--c-bone);
    border-color: var(--c-ink);
  }
  .toast[data-tone='ok'] {
    background: var(--c-status-allied);
    color: var(--c-bone);
  }
  @keyframes toast-in {
    from { transform: translateY(10px); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
  }
</style>
