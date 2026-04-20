<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';

  import { fetchMe } from '$lib/api';
  import { CrewSession } from '$lib/ws-session.svelte';
  import { toasts } from '$lib/toasts.svelte';
  import CompassRose from '$components/CompassRose.svelte';
  import Presence from '$components/Presence.svelte';
  import Adrift from '$components/Adrift.svelte';
  import Toasts from '$components/Toasts.svelte';
  import ThemeToggle from '$components/ThemeToggle.svelte';
  import Ship from '$components/Ship.svelte';
  import Characters from '$components/Characters.svelte';
  import Manifest from '$components/Manifest.svelte';
  import Reckoning from '$components/Reckoning.svelte';
  import Log from '$components/Log.svelte';
  import Bounties from '$components/Bounties.svelte';

  const code = $derived(page.params.code ?? '');
  let session = $state<CrewSession | null>(null);
  let promptingName = $state(false);
  let draftName = $state('');

  onMount(async () => {
    let initialName = '';
    try {
      const me = await fetchMe();
      initialName = me.displayName ?? '';
    } catch {
      // Identity probe failure is survivable — the user can still play,
      // we'll just prompt for a name.
    }

    if (!initialName) {
      promptingName = true;
      return;
    }
    startSession(initialName);
  });

  function startSession(name: string) {
    const s = new CrewSession(code, name);
    s.connect();
    session = s;
  }

  function commitName() {
    const name = draftName.trim();
    if (!name) return;
    promptingName = false;
    startSession(name);
  }

  function focusOnMount(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  onDestroy(() => {
    session?.dispose();
  });

  function onRename(next: string) {
    session?.rename(next);
    toasts.push(`Signed as ${next}.`, 'info');
  }
</script>

<svelte:head>
  <title>Cursed Crew — {code}</title>
</svelte:head>

{#if session}
  <Adrift state={session.state} />
{/if}

<main class="shell">
  {#if promptingName}
    <section class="name-prompt panel tilt-left">
      <h2 class="panel-head">Sign the Articles</h2>
      <p>Before you step aboard, what name will the ledger remember you by?</p>
      <div class="field">
        <label for="name">Your display name</label>
        <input
          id="name"
          class="input"
          type="text"
          maxlength="40"
          autocomplete="off"
          bind:value={draftName}
          placeholder="One-Eye"
          onkeydown={(e) => { if (e.key === 'Enter') commitName(); }}
          use:focusOnMount
        />
      </div>
      <button class="btn btn-primary" type="button" onclick={commitName}>
        Step Aboard
      </button>
    </section>
  {:else if session?.state === 'connected' && session.data}
    <div class="top">
      <Presence
        presence={session.presence}
        myName={session.displayName}
        onRename={onRename}
      />
      <div class="top-right">
        <a class="home-link" href="/">↢ Dock</a>
        <ThemeToggle />
      </div>
    </div>

    <section class="hero">
      <h1>{session.data.ship.name || 'Unnamed Ship'}</h1>
      <p class="crew-code">
        <span class="stat">{code}</span>
      </p>
    </section>

    <hr class="rule" aria-hidden="true" />

    <section class="modules">
      <Ship {session} />
      <Characters {session} />
      <Manifest {session} />
      <Reckoning {session} />
      <Log {session} />
      <Bounties {session} />
    </section>
  {:else}
    <div class="loading">
      <CompassRose size={48} label="Loading the ledger" />
      <p class="muted">Reading the ledger…</p>
    </div>
  {/if}
</main>

<Toasts />

<style>
  .shell {
    max-width: 72rem;
    margin: 0 auto;
  }
  .top {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--s-3);
    border-bottom: var(--stroke) solid var(--ink-line);
    align-items: stretch;
  }
  .top-right {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-2) var(--s-3);
  }
  @media (max-width: 640px) {
    .top {
      grid-template-columns: 1fr;
    }
    .top-right {
      border-top: var(--stroke-thin) solid var(--ink-line);
      justify-content: space-between;
    }
  }
  .home-link {
    font-family: var(--font-head);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    text-decoration: none;
    color: var(--fg-dim);
  }
  .home-link:hover {
    color: var(--fg);
  }
  .hero {
    text-align: center;
    padding: var(--s-8) var(--s-4) var(--s-4);
  }
  .hero h1 {
    color: var(--accent);
    word-break: break-word;
  }
  .crew-code {
    color: var(--fg-mute);
    font-size: 0.9rem;
    margin: 0;
  }
  .modules {
    padding: 0 var(--s-4) var(--s-12);
    display: flex;
    flex-direction: column;
    gap: var(--s-8);
  }
  @media (max-width: 520px) {
    .modules { padding: 0 var(--s-3) var(--s-8); gap: var(--s-5); }
    /* Trim panel padding on narrow screens so content isn't squeezed. */
    .modules :global(.panel) { padding: var(--s-3); }
    .modules :global(.panel-head) {
      margin: calc(var(--s-3) * -1) calc(var(--s-3) * -1) var(--s-3);
      padding: var(--s-2) var(--s-3);
      font-size: 1.5rem;
    }
  }
  .muted {
    color: var(--fg-dim);
    font-family: var(--font-body);
  }
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-4);
    padding: var(--s-16) var(--s-5);
    color: var(--fg-dim);
  }
  .name-prompt {
    max-width: 32rem;
    margin: var(--s-12) auto;
  }
  .name-prompt p {
    margin-bottom: var(--s-4);
  }
  .name-prompt button {
    margin-top: var(--s-4);
  }
</style>
