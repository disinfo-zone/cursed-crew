<script lang="ts">
  import type { CrewSession } from '$lib/ws-session.svelte';
  import type { Faction, FactionStatus } from '$lib/shared/types';

  type Props = { session: CrewSession };
  let { session }: Props = $props();

  const factions = $derived(session.data?.factions ?? []);

  const STATUS_ORDER: FactionStatus[] = [
    'allied', 'friendly', 'neutral', 'watched', 'wanted', 'kos'
  ];

  const STATUS_LABEL: Record<FactionStatus, string> = {
    allied:   'Allied',
    friendly: 'Friendly',
    neutral:  'Neutral',
    watched:  'Watched',
    wanted:   'Wanted',
    kos:      'Kill on Sight'
  };

  // Unicode glyphs chosen for readability across default OS fonts. The glyph
  // is decorative — the status label text carries the real meaning (required
  // for color-independent accessibility).
  const STATUS_GLYPH: Record<FactionStatus, string> = {
    allied:   '\u2694', // ⚔ crossed swords
    friendly: '\u2605', // ★ star
    neutral:  '\u25CB', // ○ circle
    watched:  '\u25C9', // ◉ fisheye
    wanted:   '\u2691', // ⚑ flag
    kos:      '\u2620'  // ☠ skull & crossbones
  };

  const STATUS_BLURB: Record<FactionStatus, string> = {
    allied:   'Blood-brothers at arms',
    friendly: 'A welcoming port',
    neutral:  'No quarrel. For now.',
    watched:  'Eyes on the mainsail',
    wanted:   'A price on every head',
    kos:      'Hang them from the yardarm'
  };

  function updateField<K extends keyof Faction>(id: string, field: K, value: Faction[K]) {
    session.dispatch({
      kind: 'faction.update',
      id,
      fields: { [field]: value } as Partial<Faction>
    });
  }

  const textTimers = new Map<string, ReturnType<typeof setTimeout>>();
  function debounceText(id: string, field: 'name' | 'note', value: string) {
    const key = `${id}:${field}`;
    const t = textTimers.get(key);
    if (t) clearTimeout(t);
    textTimers.set(key, setTimeout(() => updateField(id, field, value), 450));
  }

  let newFactionName = $state('');
  function addFaction() {
    const name = newFactionName.trim();
    if (!name) return;
    session.dispatch({ kind: 'faction.add', id: crypto.randomUUID(), name });
    newFactionName = '';
  }
</script>

<section class="panel reckoning" aria-labelledby="reckoning-h">
  <h2 id="reckoning-h" class="panel-head">The Reckoning</h2>

  <ul class="factions">
    {#each factions as f (f.id)}
      <li class="faction" data-status={f.status}>
        <span class="glyph" aria-hidden="true">{STATUS_GLYPH[f.status]}</span>

        <div class="body">
          <div class="top-row">
            <input
              class="faction-name"
              type="text"
              maxlength="80"
              value={f.name}
              oninput={(e) => debounceText(f.id, 'name', (e.currentTarget as HTMLInputElement).value)}
              onblur={(e) => updateField(f.id, 'name', (e.currentTarget as HTMLInputElement).value)}
              aria-label="Faction name"
            />
            <select
              class="status-select"
              value={f.status}
              data-status={f.status}
              onchange={(e) => updateField(f.id, 'status', (e.currentTarget as HTMLSelectElement).value as FactionStatus)}
              aria-label="Standing with {f.name}"
            >
              {#each STATUS_ORDER as s (s)}
                <option value={s}>{STATUS_LABEL[s]}</option>
              {/each}
            </select>
            <button
              type="button"
              class="row-remove"
              aria-label="Remove faction {f.name}"
              onclick={() => session.dispatch({ kind: 'faction.remove', id: f.id })}
            >×</button>
          </div>

          <div class="sub-row">
            <span class="status-blurb">{STATUS_BLURB[f.status]}</span>
            <input
              class="faction-note"
              type="text"
              maxlength="200"
              value={f.note}
              oninput={(e) => debounceText(f.id, 'note', (e.currentTarget as HTMLInputElement).value)}
              onblur={(e) => updateField(f.id, 'note', (e.currentTarget as HTMLInputElement).value)}
              placeholder="Why they want us…"
              aria-label="Why they want us"
            />
          </div>
        </div>
      </li>
    {/each}
  </ul>

  <div class="add-faction">
    <input
      class="input"
      type="text"
      maxlength="80"
      bind:value={newFactionName}
      placeholder="The Cult of the Drowned, Smugglers of Blackrock Cove…"
      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFaction(); } }}
    />
    <button type="button" class="btn" onclick={addFaction} disabled={newFactionName.trim() === ''}>Write them in</button>
  </div>
</section>

<style>
  .factions {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }

  /* ── Per-status treatments ──────────────────────────────────────────
   *   Each row gets its own band-color + tinted background + glyph color.
   *   Order (allied → kos) reads as a slow descent from friend to foe. */
  .faction {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--s-3);
    align-items: center;
    padding: var(--s-3);
    border-left: 8px solid var(--fg-mute);
    background: var(--bg);
    position: relative;
  }

  .faction[data-status='allied'] {
    border-left-color: var(--c-status-allied);
    background: color-mix(in oklab, var(--c-status-allied) 12%, var(--bg));
  }
  .faction[data-status='friendly'] {
    border-left-color: var(--c-status-friendly);
    background: color-mix(in oklab, var(--c-status-friendly) 10%, var(--bg));
  }
  .faction[data-status='neutral'] {
    border-left-color: var(--c-status-neutral);
    background: var(--bg);
  }
  .faction[data-status='watched'] {
    border-left-color: var(--c-status-watched);
    background: color-mix(in oklab, var(--c-status-watched) 10%, var(--bg));
  }
  .faction[data-status='wanted'] {
    border-left-color: var(--c-status-wanted);
    background: color-mix(in oklab, var(--c-status-wanted) 15%, var(--bg));
  }
  .faction[data-status='kos'] {
    border-left-color: var(--c-status-kos);
    background: color-mix(in oklab, var(--c-status-kos) 40%, var(--bg));
  }

  /* ── Glyph column ─────────────────────────────────────────────────── */
  .glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    font-size: 1.75rem;
    line-height: 1;
    font-family: var(--font-body); /* fall back through OS glyphs */
    color: var(--fg-mute);
    flex-shrink: 0;
  }
  .faction[data-status='allied']   .glyph { color: var(--c-status-allied);   text-shadow: 0 0 0 var(--c-status-allied); }
  .faction[data-status='friendly'] .glyph { color: var(--c-status-friendly); }
  .faction[data-status='neutral']  .glyph { color: var(--fg-mute); }
  .faction[data-status='watched']  .glyph { color: var(--c-status-watched); }
  .faction[data-status='wanted']   .glyph { color: var(--c-status-wanted); }
  .faction[data-status='kos']      .glyph { color: var(--c-bone); }

  /* ── Body ──────────────────────────────────────────────────────────── */
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    min-width: 0;
  }
  .top-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 12rem auto;
    gap: var(--s-2);
    align-items: center;
  }
  @media (max-width: 560px) {
    .top-row {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        "name    remove"
        "status  status";
    }
    .faction-name   { grid-area: name; }
    .status-select  { grid-area: status; }
    .row-remove     { grid-area: remove; }
  }

  .faction-name {
    background: transparent;
    border: 0;
    border-bottom: var(--stroke-thin) dashed currentColor;
    padding: var(--s-1) 0;
    font-family: var(--font-head);
    font-size: 1.05rem;
    letter-spacing: 0.03em;
    color: var(--fg);
    min-width: 0;
  }
  .faction-name:focus { outline: none; border-bottom-style: solid; border-bottom-color: var(--accent); }

  .sub-row {
    display: grid;
    grid-template-columns: minmax(10rem, auto) minmax(0, 1fr);
    gap: var(--s-3);
    align-items: baseline;
  }
  @media (max-width: 560px) {
    .sub-row { grid-template-columns: 1fr; }
  }

  .status-blurb {
    font-family: var(--font-body);
    font-style: italic;
    font-size: 0.85rem;
    color: var(--fg-dim);
    white-space: nowrap;
  }
  .faction[data-status='kos'] .status-blurb { color: var(--c-bone); }

  .faction-note {
    background: transparent;
    border: 0;
    border-bottom: var(--stroke-thin) dotted var(--fg-dim);
    padding: var(--s-1) 0;
    font-family: var(--font-body);
    color: var(--fg-dim);
    font-size: 0.9rem;
    min-width: 0;
  }
  .faction-note:focus { outline: none; border-bottom-color: var(--accent); border-bottom-style: solid; color: var(--fg); }
  .faction[data-status='kos'] .faction-note { color: var(--c-bone); border-bottom-color: var(--c-parchment-deep); }

  /* ── Select (color-coded to match status) ─────────────────────────── */
  .status-select {
    width: 100%;
    min-height: var(--tap-min);
    padding: var(--s-2) var(--s-8) var(--s-2) var(--s-3);
    border: var(--stroke) solid var(--ink-line);
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-head);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-radius: 0;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'><path d='M1 1 L6 6 L11 1' stroke='%23EFE3C8' stroke-width='1.5' fill='none'/></svg>");
    background-repeat: no-repeat;
    background-position: right var(--s-3) center;
    cursor: pointer;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }
  .status-select[data-status='allied']   { background-color: var(--c-status-allied);   color: var(--c-bone); border-color: var(--c-status-allied); }
  .status-select[data-status='friendly'] { background-color: var(--c-status-friendly); color: var(--c-bone); border-color: var(--c-status-friendly); }
  .status-select[data-status='neutral']  { background-color: var(--c-status-neutral);  color: var(--c-bone); border-color: var(--c-status-neutral); }
  .status-select[data-status='watched']  { background-color: var(--c-status-watched);  color: var(--c-bone); border-color: var(--c-status-watched); }
  .status-select[data-status='wanted']   { background-color: var(--c-status-wanted);   color: var(--c-bone); border-color: var(--c-status-wanted); }
  .status-select[data-status='kos']      { background-color: var(--c-status-kos);      color: var(--c-bone); border-color: var(--c-status-kos); }
  .status-select:focus { outline: var(--ring) solid var(--accent-bright); outline-offset: 2px; }

  /* ── Remove + Add ─────────────────────────────────────────────────── */
  .row-remove {
    width: 36px; height: 36px; line-height: 1;
    font-family: var(--font-mono); font-size: 1.1rem;
    background: transparent; color: var(--fg-dim);
    border: var(--stroke-thin) solid var(--fg-dim); cursor: pointer;
    flex-shrink: 0;
  }
  .faction[data-status='kos'] .row-remove { color: var(--c-bone); border-color: var(--c-parchment-deep); }
  .row-remove:hover { background: var(--accent); color: var(--c-bone); border-color: var(--accent); }

  .add-faction {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--s-2);
    margin-top: var(--s-4);
  }
  @media (max-width: 480px) {
    .add-faction { grid-template-columns: 1fr; }
  }
</style>
