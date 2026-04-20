<script lang="ts">
  import type { ConnState } from '$lib/ws-session.svelte';
  import CompassRose from './CompassRose.svelte';

  type Props = { state: ConnState };
  let { state }: Props = $props();

  const shown = $derived(state === 'adrift' || state === 'connecting');
  const text = $derived(
    state === 'connecting' ? 'Hauling anchor…' : 'Adrift. Reconnecting…'
  );
</script>

{#if shown}
  <div class="adrift" role="status" aria-live="polite">
    <CompassRose size={16} label={text} />
    <span>{text}</span>
  </div>
{/if}

<style>
  .adrift {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--s-2);
  }
</style>
