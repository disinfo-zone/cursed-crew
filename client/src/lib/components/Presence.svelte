<script lang="ts">
  import type { PresenceEntry } from '$lib/shared/types';

  type Props = {
    presence: PresenceEntry[];
    myName: string;
    onRename: (newName: string) => void;
  };

  let { presence, myName, onRename }: Props = $props();

  let editing = $state(false);
  let draft = $state('');

  function startEdit() {
    draft = myName;
    editing = true;
  }
  function commit() {
    const next = draft.trim();
    editing = false;
    if (next && next !== myName) onRename(next);
  }
  function cancel() {
    editing = false;
  }
  function focusOnMount(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
  function initialsOf(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return '??';
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return ((parts[0]![0] ?? '') + (parts.at(-1)![0] ?? '')).toUpperCase();
  }
</script>

<div class="presence" aria-label="Currently at the table">
  <span class="label" aria-hidden="true">At the table:</span>
  <ul>
    {#each presence as p (p.clientId)}
      {#if p.displayName === myName}
        <li class="mine">
          {#if editing}
            <input
              class="rename-input"
              type="text"
              maxlength="40"
              bind:value={draft}
              use:focusOnMount
              onblur={commit}
              onkeydown={(e) => {
                if (e.key === 'Enter') commit();
                else if (e.key === 'Escape') cancel();
              }}
            />
          {:else}
            <button
              type="button"
              class="seal seal-mine"
              onclick={startEdit}
              title="Click to rename"
              aria-label="Your name: {p.displayName}. Click to rename."
            >
              <span aria-hidden="true">{initialsOf(p.displayName)}</span>
              <span class="visually-hidden">{p.displayName}</span>
            </button>
          {/if}
          <span class="full-name">{p.displayName}</span>
        </li>
      {:else}
        <li>
          <span class="seal" aria-label={p.displayName}>
            <span aria-hidden="true">{initialsOf(p.displayName)}</span>
          </span>
          <span class="full-name">{p.displayName}</span>
        </li>
      {/if}
    {/each}
  </ul>
</div>

<style>
  .presence {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4);
    background: var(--bg-dim);
    border-bottom: var(--stroke) solid var(--ink-line);
  }
  .label {
    font-family: var(--font-head);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--fg-dim);
    white-space: nowrap;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    gap: var(--s-3);
    flex-wrap: wrap;
  }
  li {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
  }
  .mine .seal-mine {
    cursor: pointer;
    padding: 0;
  }
  .mine .seal-mine:hover {
    background: var(--accent-bright);
  }
  .mine .seal-mine:focus-visible {
    outline: var(--ring) solid var(--c-bone);
    outline-offset: 2px;
  }
  .full-name {
    font-family: var(--font-head);
    font-size: 0.85rem;
    letter-spacing: 0.04em;
    color: var(--fg-dim);
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rename-input {
    background: var(--bg);
    border: var(--stroke) solid var(--accent);
    color: var(--fg);
    font-family: var(--font-head);
    font-size: 0.9rem;
    padding: var(--s-1) var(--s-2);
    width: 10rem;
    min-height: 32px;
  }
  @media (max-width: 640px) {
    .full-name { display: none; }
    .presence { padding: var(--s-2) var(--s-3); }
  }
</style>
