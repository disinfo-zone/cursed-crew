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
    top: 0;
    left: 0;
    right: 0;
    z-index: 60;
    pointer-events: none;
  }
</style>
