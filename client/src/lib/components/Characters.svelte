<script lang="ts">
  import type { CrewSession } from '$lib/ws-session.svelte';
  import CharacterCard from './CharacterCard.svelte';

  type Props = { session: CrewSession };
  let { session }: Props = $props();

  const living = $derived(session.data?.characters ?? []);
  const deceased = $derived(session.data?.deceased ?? []);
  const crewFull = $derived(living.length >= 8);

  // Per-card collapsed state — lives in the client page only, not sync'd,
  // because it's a private view preference (everyone at the table may
  // collapse different cards).
  let collapsed = $state<Record<string, boolean>>({});
  function toggleCollapsed(id: string) {
    collapsed = { ...collapsed, [id]: !collapsed[id] };
  }

  function collapseAll() {
    const next: Record<string, boolean> = {};
    for (const c of living) next[c.id] = true;
    for (const c of deceased) next[c.id] = true;
    collapsed = next;
  }
  function expandAll() {
    collapsed = {};
  }

  function addCharacter() {
    if (crewFull) return;
    session.dispatch({ kind: 'character.create', id: crypto.randomUUID() });
  }

  function tiltFor(index: number): 'left' | 'right' | 'none' {
    return index % 2 === 0 ? 'left' : 'right';
  }
</script>

<section class="panel crew" aria-labelledby="crew-h">
  <div class="head-row">
    <h2 id="crew-h" class="panel-head">The Crew</h2>
    <div class="head-actions">
      <button type="button" class="head-btn" onclick={collapseAll}>collapse all</button>
      <button type="button" class="head-btn" onclick={expandAll}>expand all</button>
    </div>
  </div>

  <div class="grid">
    {#each living as c, i (c.id)}
      <CharacterCard
        {session}
        character={c}
        deceased={false}
        tilt={tiltFor(i)}
        collapsed={!!collapsed[c.id]}
        onToggleCollapsed={() => toggleCollapsed(c.id)}
      />
    {/each}

    {#if !crewFull}
      <button type="button" class="add-card" onclick={addCharacter}>
        <span class="plus" aria-hidden="true">+</span>
        <span class="add-label">Sign another</span>
      </button>
    {/if}
  </div>

  {#if deceased.length > 0}
    <hr class="rule" aria-hidden="true" />
    <h3 class="locker-head">Davy Jones' Locker</h3>
    <div class="grid locker-grid">
      {#each deceased as c, i (c.id)}
        <CharacterCard
          {session}
          character={c}
          deceased={true}
          tilt={tiltFor(i)}
          collapsed={!!collapsed[c.id]}
          onToggleCollapsed={() => toggleCollapsed(c.id)}
        />
      {/each}
    </div>
  {/if}
</section>

<style>
  .head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    margin-bottom: var(--s-5);
    flex-wrap: wrap;
  }
  .head-actions {
    display: inline-flex;
    gap: var(--s-1);
    flex-wrap: wrap;
  }
  .head-btn {
    font-family: var(--font-head);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    padding: var(--s-1) var(--s-2);
    border: var(--stroke-thin) solid var(--fg-dim);
    background: transparent;
    color: var(--fg-dim);
    cursor: pointer;
    min-height: 32px;
  }
  .head-btn:hover { border-color: var(--fg); color: var(--fg); }

  /* CSS multicolumn gives masonry-style packing: mixed expanded / collapsed
   * cards flow naturally without forcing the row height to the tallest card.
   * Items read top-to-bottom per column. */
  .grid {
    column-count: 1;
    column-gap: var(--s-5);
  }
  @media (min-width: 720px)  { .grid { column-count: 2; } }
  @media (min-width: 1160px) { .grid { column-count: 3; } }

  .grid :global(> *) {
    break-inside: avoid;
    display: block;
    margin-bottom: var(--s-5);
    width: 100%;
  }

  .add-card {
    background: transparent;
    border: var(--stroke-heavy) dashed var(--fg-dim);
    min-height: 5rem;
    color: var(--fg-dim);
    font-family: var(--font-head);
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: var(--s-3);
    cursor: pointer;
    padding: var(--s-3);
  }
  .add-card:hover { border-color: var(--fg); color: var(--fg); background: var(--bg-dim); }
  .plus { font-family: var(--font-display); font-size: 1.75rem; line-height: 1; color: var(--fg-dim); }
  .add-label { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.12em; }

  /* Masonry (CSS columns) treats Davy Jones' Locker as a separate flow. */
  .locker-grid { margin-top: var(--s-3); }

  .locker-head {
    font-family: var(--font-head);
    font-size: 1rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--fg-mute);
    margin: var(--s-4) 0;
  }
  .locker-grid { opacity: 0.85; }
</style>
