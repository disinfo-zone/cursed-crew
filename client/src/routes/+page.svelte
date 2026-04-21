<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    ApiError,
    createCrew,
    fetchMe,
    parseCrewCode,
    type Me
  } from '$lib/api';
  import CompassRose from '$components/CompassRose.svelte';
  import ThemeToggle from '$components/ThemeToggle.svelte';

  // State
  let me = $state<Me | null>(null);
  let loading = $state(true);

  // "Raise the Black Flag" form
  let crewName = $state('');
  let shipName = $state('');
  let displayName = $state('');
  let creating = $state(false);
  let createError = $state<string | null>(null);

  // "Step Aboard" form
  let rejoinInput = $state('');
  let rejoinError = $state<string | null>(null);

  onMount(async () => {
    try {
      me = await fetchMe();
      if (me.displayName) displayName = me.displayName;
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  });

  async function onCreate(ev: SubmitEvent) {
    ev.preventDefault();
    if (creating) return;
    createError = null;

    const name = crewName.trim();
    if (!name) {
      createError = 'The crew must have a name.';
      return;
    }

    creating = true;
    try {
      const result = await createCrew({
        name,
        shipName: shipName.trim() || undefined,
        displayName: displayName.trim() || undefined
      });
      await goto(`/c/${result.code}`);
    } catch (err) {
      creating = false;
      createError = errorCopy(err);
    }
  }

  function onRejoin(ev: SubmitEvent) {
    ev.preventDefault();
    rejoinError = null;
    const code = parseCrewCode(rejoinInput);
    if (!code) {
      rejoinError = 'That code does not match any shape known in these waters.';
      return;
    }
    goto(`/c/${code}`);
  }

  function errorCopy(err: unknown): string {
    if (err instanceof ApiError) {
      switch (err.code) {
        case 'invalid_name':
          return 'The ledger demands a crew name.';
        case 'invalid_ship_name':
          return 'That ship name is too long or too strange.';
        case 'invalid_display_name':
          return 'That signer name is too long or too strange.';
        case 'create_failed':
          return 'The scriptorium is in storm. Try again.';
        default:
          return `The ledger refused the entry (${err.code}).`;
      }
    }
    return 'The signal could not reach the ship. Check your connection.';
  }
</script>

<svelte:head>
  <meta name="description" content="A shared ledger for doomed scoundrels playing Pirate Borg." />
</svelte:head>

<main class="page">
  <header class="top">
    <ThemeToggle />
  </header>

  <section class="hero">
    <h1>Cursed Crew</h1>
    <p class="tagline">
      A shared ledger for doomed scoundrels. The book remembers what the bottle forgets.
    </p>
  </section>

  <hr class="rule" aria-hidden="true" />

  <div class="grid">
    <!-- Create crew -->
    <section class="panel tilt-left" aria-labelledby="create-h">
      <h2 id="create-h" class="panel-head">Raise the Black Flag</h2>
      <form class="stack" onsubmit={onCreate}>
        <div class="field">
          <label for="crewName">What shall this doomed company be called?</label>
          <input
            id="crewName"
            class="input"
            type="text"
            maxlength="80"
            required
            autocomplete="off"
            bind:value={crewName}
            placeholder="The Salt-Cursed, The Grog-Runners, Three Dead Men…"
          />
        </div>

        <div class="field">
          <label for="shipName">And the ship you'll bleed out upon? <span class="opt">(optional)</span></label>
          <input
            id="shipName"
            class="input"
            type="text"
            maxlength="80"
            autocomplete="off"
            bind:value={shipName}
            placeholder="Widow of the Wreck"
          />
        </div>

        <div class="field">
          <label for="displayName">And you, signer of the articles? <span class="opt">(optional)</span></label>
          <input
            id="displayName"
            class="input"
            type="text"
            maxlength="40"
            autocomplete="off"
            bind:value={displayName}
            placeholder="One-Eye"
          />
        </div>

        <p class="warn">
          <strong>Guard the link you are about to receive.</strong>
          It is the only key to this crew. Bookmark it, scratch it into the mast,
          pass it around the table. There are no password-recovery priests in this sea.
        </p>

        {#if createError}
          <p class="err" role="alert">{createError}</p>
        {/if}

        <button class="btn btn-primary" type="submit" disabled={creating}>
          {#if creating}
            <CompassRose size={18} label="Signing the articles" />
            <span style="margin-left: var(--s-2)">Signing the articles…</span>
          {:else}
            Sign the Articles
          {/if}
        </button>
      </form>
    </section>

    <!-- Rejoin crew -->
    <section class="panel tilt-right" aria-labelledby="rejoin-h">
      <h2 id="rejoin-h" class="panel-head">Step Aboard</h2>
      <form class="stack" onsubmit={onRejoin}>
        <div class="field">
          <label for="rejoin">Paste a crew code or link.</label>
          <input
            id="rejoin"
            class="input"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            bind:value={rejoinInput}
            placeholder="bloody-kraken-rum"
          />
        </div>

        {#if rejoinError}
          <p class="err" role="alert">{rejoinError}</p>
        {/if}

        <button class="btn" type="submit">Step Aboard</button>
      </form>

      {#if loading}
        <p class="muted"><CompassRose size={14} /> Reading the margins…</p>
      {:else if me && me.crews.length > 0}
        <h3 class="known-head">Logged in the Margins</h3>
        <ul class="known">
          {#each me.crews as c (c.code)}
            <li>
              <a href="/c/{c.code}">
                <span class="known-name">{c.name}</span>
                <span class="known-code">{c.code}</span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>

  <hr class="rule" aria-hidden="true" />

  <footer class="foot">
    <p>
      An independent fan project. Not affiliated with Limithron, Stockholm Kartell,
      or Free League Publishing. Pirate Borg is published under the Mörk Borg
      Third Party License.
    </p>
  </footer>
</main>

<style>
  .page {
    max-width: 72rem;
    margin: 0 auto;
    padding: var(--s-6) var(--s-5) var(--s-12);
  }
  .top {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--s-6);
  }
  .hero {
    text-align: center;
    padding: var(--s-8) 0 var(--s-4);
  }
  .hero h1 {
    color: var(--accent);
    transform: rotate(-0.3deg);
    text-shadow: 1px 1px 0 var(--bg-deep);
  }
  .tagline {
    font-family: var(--font-body);
    font-style: italic;
    font-size: 1.15rem;
    color: var(--fg-dim);
    max-width: 34rem;
    margin: var(--s-3) auto 0;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--s-8);
  }
  @media (min-width: 860px) {
    .grid { grid-template-columns: 1fr 1fr; gap: var(--s-6); }
  }
  .opt {
    font-size: 0.8em;
    color: var(--fg-mute);
    font-style: italic;
  }
  .warn {
    font-family: var(--font-body);
    font-size: 0.95rem;
    color: var(--accent-bright);
    font-style: italic;
    padding: var(--s-2) 0;
    margin: 0;
  }
  .warn strong {
    color: var(--fg);
  }
  .err {
    color: var(--accent-bright);
    font-family: var(--font-body);
    font-style: italic;
    margin: 0;
  }
  .muted {
    color: var(--fg-dim);
    font-family: var(--font-body);
    font-style: italic;
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
  }
  .known-head {
    margin-top: var(--s-6);
  }
  .known {
    list-style: none;
    padding: 0;
    margin: var(--s-3) 0 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .known li {
    background: color-mix(in oklab, var(--fg) 3%, transparent);
  }
  .known a {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: var(--s-3) var(--s-4);
    text-decoration: none;
    color: var(--fg);
    border-left: var(--stroke-heavy) solid var(--accent);
    transition: background 60ms linear;
  }
  .known a:hover {
    background: color-mix(in oklab, var(--accent) 8%, var(--bg));
    text-decoration: none;
  }
  .known-name {
    font-family: var(--font-head);
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .known-code {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--fg-dim);
  }
  .foot {
    text-align: center;
    color: var(--fg-mute);
    font-size: 0.8rem;
    font-style: italic;
  }
</style>
