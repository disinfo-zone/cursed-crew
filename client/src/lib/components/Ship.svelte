<script lang="ts">
  import type { CrewSession } from '$lib/ws-session.svelte';
  import type { HullTier, Ship } from '$lib/shared/types';
  import Stepper from './Stepper.svelte';

  type Props = { session: CrewSession };
  let { session }: Props = $props();

  const ship = $derived(session.data?.ship as Ship | undefined);
  const cargoUsed = $derived(
    session.data?.manifest.cargo.reduce((n, c) => n + c.slots, 0) ?? 0
  );
  const overCapacity = $derived(!!ship && cargoUsed > ship.cargoMax);

  // Book vessels, grouped by size / rig for a coherent dropdown. Order
  // within each group is rough size ascending.
  const VESSEL_GROUPS: Array<{ label: string; items: string[] }> = [
    { label: 'Small · Light Rig',  items: ['Longship', 'Dhow', 'Junk', 'Pinnace', 'Cutter', 'Sloop', 'Pirate Sloop', 'Schooner'] },
    { label: 'Medium',             items: ['Brigantine', 'Brig', 'Fluyt', 'Privateer'] },
    { label: 'Large · Warships',   items: ['Corvette', 'Frigate', 'Merchantman', 'Galleon', 'Bomb Vessel', 'Man-o-War'] }
  ];
  const VESSEL_CLASSES = VESSEL_GROUPS.flatMap((g) => g.items);
  const OTHER = '__other__';

  const classSelection = $derived(
    ship && VESSEL_CLASSES.includes(ship.class) ? ship.class : OTHER
  );
  const showCustomClass = $derived(classSelection === OTHER);

  function onClassSelect(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    if (v === OTHER) {
      if (ship && VESSEL_CLASSES.includes(ship.class)) setField('class', '');
    } else {
      setField('class', v);
    }
  }

  const HULL_TIERS: Array<{ value: HullTier; label: string; die: string }> = [
    { value: 'light',  label: 'Light',  die: '−d2' },
    { value: 'medium', label: 'Medium', die: '−d4' },
    { value: 'heavy',  label: 'Heavy',  die: '−d6' }
  ];

  let nameTimer: ReturnType<typeof setTimeout> | null = null;
  let classTimer: ReturnType<typeof setTimeout> | null = null;
  let notesTimer: ReturnType<typeof setTimeout> | null = null;

  function setField<K extends keyof Ship>(field: K, value: Ship[K]) {
    session.dispatch({ kind: 'ship.set', field, value });
  }

  function debounceText<K extends keyof Ship>(
    field: K,
    value: Ship[K],
    ref: 'name' | 'class' | 'notes'
  ) {
    const timers = { name: nameTimer, class: classTimer, notes: notesTimer };
    const cur = timers[ref];
    if (cur) clearTimeout(cur);
    const t = setTimeout(() => setField(field, value), 450);
    if (ref === 'name') nameTimer = t;
    else if (ref === 'class') classTimer = t;
    else notesTimer = t;
  }

  let upgradeDraft = $state('');
  function addUpgrade() {
    const text = upgradeDraft.trim();
    if (!text) return;
    session.dispatch({ kind: 'ship.addUpgrade', text });
    upgradeDraft = '';
  }

  let shantyDraft = $state('');
  function addShanty() {
    const text = shantyDraft.trim();
    if (!text) return;
    session.dispatch({ kind: 'ship.addShanty', text });
    shantyDraft = '';
  }

  const dieFormat = (n: number) => `d${n}`;
</script>

{#if ship}
  <section class="panel ship">
    <h2 class="panel-head">The Ship</h2>

    <!-- Name — big, centered, hand-set type -->
    <div class="field name-field">
      <input
        id="ship-name"
        class="input ship-name"
        type="text"
        maxlength="80"
        value={ship.name}
        oninput={(e) => debounceText('name', (e.currentTarget as HTMLInputElement).value, 'name')}
        onblur={(e) => setField('name', (e.currentTarget as HTMLInputElement).value)}
        placeholder="Unnamed ship"
        aria-label="Ship name"
      />
    </div>

    <!-- Class + Hull tier -->
    <div class="class-row">
      <div class="field">
        <label for="ship-class">Class</label>
        <select
          id="ship-class"
          class="select"
          value={classSelection}
          onchange={onClassSelect}
        >
          {#each VESSEL_GROUPS as g (g.label)}
            <option disabled>— {g.label} —</option>
            {#each g.items as v (v)}
              <option value={v}>{v}</option>
            {/each}
          {/each}
          <option disabled>— Custom —</option>
          <option value={OTHER}>Other…</option>
        </select>
      </div>

      {#if showCustomClass}
        <div class="field grow">
          <label for="ship-class-custom">Custom</label>
          <input
            id="ship-class-custom"
            class="input"
            type="text"
            maxlength="80"
            value={ship.class}
            placeholder="e.g. Ketch, Xebec, …"
            oninput={(e) => debounceText('class', (e.currentTarget as HTMLInputElement).value, 'class')}
            onblur={(e) => setField('class', (e.currentTarget as HTMLInputElement).value)}
          />
        </div>
      {/if}

      <div class="field hull-field">
        <span id="hull-label" class="field-label">Hull</span>
        <div class="tier-group" role="radiogroup" aria-labelledby="hull-label">
          {#each HULL_TIERS as t (t.value)}
            <button
              type="button"
              class="tier-btn"
              class:tier-on={ship.hullTier === t.value}
              role="radio"
              aria-checked={ship.hullTier === t.value}
              onclick={() => setField('hullTier', t.value)}
            >
              <span class="tier-label">{t.label}</span>
              <span class="tier-die">{t.die}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Stat blocks — big stamped numbers, 4-up on desktop -->
    <div class="stats-grid">
      <div class="stat-block">
        <span class="stat-name">HP</span>
        <div class="stat-pair">
          <Stepper
            value={ship.hp}
            min={-99}
            max={ship.maxHp > 0 ? ship.maxHp : 9999}
            label="HP"
            onChange={(v) => setField('hp', v)}
            compact
          />
          <span class="slash">/</span>
          <Stepper
            value={ship.maxHp}
            min={1}
            max={9999}
            label="Max HP"
            onChange={(v) => setField('maxHp', v)}
            compact
          />
        </div>
      </div>

      <div class="stat-block">
        <span class="stat-name">Broadsides</span>
        <Stepper
          value={ship.broadsides ?? 0}
          min={0}
          max={12}
          step={2}
          label="Broadsides"
          onChange={(v) => setField('broadsides', v)}
          compact
          format={dieFormat}
        />
      </div>

      <div class="stat-block">
        <span class="stat-name">Small Arms</span>
        <Stepper
          value={ship.smallArms ?? 0}
          min={0}
          max={12}
          step={2}
          label="Small Arms"
          onChange={(v) => setField('smallArms', v)}
          compact
          format={dieFormat}
        />
      </div>

      <div class="stat-block">
        <span class="stat-name">Ram</span>
        <Stepper
          value={ship.ram ?? 0}
          min={0}
          max={12}
          step={2}
          label="Ram"
          onChange={(v) => setField('ram', v)}
          compact
          format={dieFormat}
        />
      </div>

      <div class="stat-block">
        <span class="stat-name">Speed</span>
        <Stepper
          value={ship.speed}
          min={0}
          max={999}
          label="Speed"
          onChange={(v) => setField('speed', v)}
          compact
        />
      </div>

      <div class="stat-block">
        <span class="stat-name">Agility</span>
        <Stepper
          value={ship.agility ?? 0}
          min={-10}
          max={30}
          label="Agility"
          onChange={(v) => setField('agility', v)}
          compact
        />
      </div>

      <div class="stat-block">
        <span class="stat-name">Skill</span>
        <Stepper
          value={ship.skill}
          min={-10}
          max={30}
          label="Skill"
          onChange={(v) => setField('skill', v)}
          compact
        />
      </div>

      <div class="stat-block">
        <span class="stat-name">Cargo</span>
        <div class="stat-pair">
          <span class="cargo-used stat" class:over={overCapacity}>{cargoUsed}</span>
          <span class="slash">/</span>
          <Stepper
            value={ship.cargoMax}
            min={0}
            max={9999}
            label="Cargo max"
            onChange={(v) => setField('cargoMax', v)}
            compact
          />
        </div>
      </div>
    </div>

    <!-- Crew — full-width trio -->
    <div class="crew-band">
      <span class="stat-name">Crew</span>
      <div class="crew-trio">
        <div class="crew-cell">
          <span class="crew-label">Aboard</span>
          <Stepper
            value={ship.crewCount}
            min={0}
            max={9999}
            label="Crew count"
            onChange={(v) => setField('crewCount', v)}
            compact
          />
        </div>
        <div class="crew-cell">
          <span class="crew-label">Min</span>
          <Stepper
            value={ship.minCrew}
            min={0}
            max={9999}
            label="Min crew"
            onChange={(v) => setField('minCrew', v)}
            compact
          />
        </div>
        <div class="crew-cell">
          <span class="crew-label">Max</span>
          <Stepper
            value={ship.maxCrew}
            min={0}
            max={9999}
            label="Max crew"
            onChange={(v) => setField('maxCrew', v)}
            compact
          />
        </div>
      </div>
    </div>

    {#if overCapacity}
      <p class="warn" role="status">
        The hold is straining — <span class="stat">{cargoUsed}</span> slots packed against <span class="stat">{ship.cargoMax}</span>. She'll sail slow and heavy.
      </p>
    {/if}

    <!-- Upgrades -->
    <div class="field upgrades">
      <span class="field-label">Upgrades</span>
      {#if ship.upgrades.length > 0}
        <ul class="upgrade-list">
          {#each ship.upgrades as u, i}
            <li>
              <span class="upgrade-text">{u}</span>
              <button
                type="button"
                class="upgrade-remove"
                aria-label="Remove upgrade {u}"
                onclick={() => session.dispatch({ kind: 'ship.removeUpgrade', index: i })}
              >×</button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">No upgrades. She sails as she is.</p>
      {/if}
      <div class="upgrade-add">
        <input
          class="input"
          type="text"
          maxlength="200"
          bind:value={upgradeDraft}
          placeholder="Iron-banded hull, ram prow, black sails…"
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUpgrade(); } }}
        />
        <button type="button" class="btn" onclick={addUpgrade} disabled={upgradeDraft.trim().length === 0}>Add</button>
      </div>
    </div>

    <!-- Shanties -->
    <div class="field upgrades shanties">
      <span class="field-label">Shanties</span>
      <p class="muted">Each day the crew can sing <span class="stat">1 + captain's Spirit</span> shanties. Test Crew Skill DR12.</p>
      {#if (ship.shanties ?? []).length > 0}
        <ul class="upgrade-list">
          {#each (ship.shanties ?? []) as s, i}
            <li>
              <span class="upgrade-text">{s}</span>
              <button
                type="button"
                class="upgrade-remove"
                aria-label="Remove shanty {s}"
                onclick={() => session.dispatch({ kind: 'ship.removeShanty', index: i })}
              >×</button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">The crew knows no songs yet.</p>
      {/if}
      <div class="upgrade-add">
        <input
          class="input"
          type="text"
          maxlength="200"
          bind:value={shantyDraft}
          placeholder="Blow the Man Down, Drop of Nelson's Blood…"
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addShanty(); } }}
        />
        <button type="button" class="btn" onclick={addShanty} disabled={shantyDraft.trim().length === 0}>Add</button>
      </div>
    </div>

    <!-- Notes -->
    <div class="field">
      <label for="ship-notes">Notes</label>
      <textarea
        id="ship-notes"
        class="textarea"
        maxlength="8000"
        value={ship.notes}
        oninput={(e) => debounceText('notes', (e.currentTarget as HTMLTextAreaElement).value, 'notes')}
        onblur={(e) => setField('notes', (e.currentTarget as HTMLTextAreaElement).value)}
        placeholder="What the hull remembers, what the sails have seen…"
      ></textarea>
    </div>
  </section>
{/if}

<style>
  .ship .name-field { margin-bottom: var(--s-4); }
  .ship-name {
    font-family: var(--font-display);
    font-size: clamp(1.5rem, 3vw, 2.5rem);
    letter-spacing: 0.02em;
    text-align: center;
    color: var(--accent);
  }

  .class-row {
    display: grid;
    grid-template-columns: minmax(10rem, 1fr) auto;
    gap: var(--s-4);
    align-items: end;
  }
  .class-row .grow { grid-column: 1 / -1; }
  @media (max-width: 620px) {
    .class-row { grid-template-columns: 1fr; }
  }

  .select {
    min-height: var(--tap-min);
    padding: var(--s-2) var(--s-3);
    border: 0;
    border-bottom: var(--stroke) solid var(--ink-line);
    background: color-mix(in oklab, var(--fg) 3%, transparent);
    color: var(--fg);
    font-family: var(--font-head);
    font-size: 0.9rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-radius: 0;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'><path d='M1 1 L6 6 L11 1' stroke='currentColor' stroke-width='1.5' fill='none'/></svg>");
    background-repeat: no-repeat;
    background-position: right var(--s-3) center;
    padding-right: var(--s-8);
    width: 100%;
    outline: none;
  }

  .select:focus {
    border-bottom-color: var(--accent-bright);
    background: color-mix(in oklab, var(--fg) 6%, transparent);
  }

  .tier-group {
    display: inline-flex;
    gap: var(--s-1);
  }
  .tier-btn {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    padding: var(--s-2) var(--s-3);
    background: var(--bg);
    color: var(--fg-dim);
    border: 0;
    cursor: pointer;
    min-width: 56px;
    min-height: var(--tap-min);
  }
  .tier-btn:hover { background: var(--bg-dim); color: var(--fg); }
  .tier-btn.tier-on { background: var(--accent); color: var(--c-bone); }
  .tier-btn:focus-visible { outline: var(--ring) solid var(--accent-bright); outline-offset: -2px; }
  .tier-label { font-family: var(--font-head); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; }
  .tier-die { font-size: 0.8rem; }

  /* ─── Stat grid ─────────────────────────────────────────────────────── */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--s-5) var(--s-4);
    margin-top: var(--s-5);
    align-items: start;
  }
  @media (min-width: 720px) { .stats-grid { grid-template-columns: repeat(4, 1fr); } }

  .stat-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--s-2);
    min-width: 0;
  }
  .stat-name {
    font-family: var(--font-head);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--fg-dim);
  }
  .stat-pair {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    flex-wrap: nowrap;
    min-width: 0;
  }

  /* Bigger stamped numbers inside the ship card */
  .ship :global(.stepper-value) {
    font-size: 1.75rem;
    min-width: 3ch;
    padding: var(--s-1) var(--s-2);
    min-height: 44px;
  }
  .ship :global(.step-btn) {
    font-size: 1.75rem;
  }
  .ship :global(.stepper.compact .stepper-value) {
    font-size: 1.75rem;
    min-width: 3ch;
    padding: var(--s-1) var(--s-2);
    min-height: 44px;
  }
  .ship :global(.stepper.compact .step-btn) {
    font-size: 1.75rem;
  }

  .slash {
    color: var(--fg-mute);
    font-family: var(--font-mono);
    font-size: 1.4rem;
  }
  .cargo-used {
    font-family: var(--font-mono);
    font-size: 1.75rem;
    min-width: 2.5ch;
    text-align: center;
    padding: var(--s-1) var(--s-2);
    background: color-mix(in oklab, var(--fg) 6%, transparent);
  }
  .cargo-used.over {
    color: var(--accent-bright);
    background: color-mix(in oklab, var(--accent-bright) 10%, transparent);
  }

  /* ─── Crew band ─────────────────────────────────────────────────────── */
  .crew-band {
    margin-top: var(--s-5);
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .crew-trio {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--s-3);
  }
  .crew-cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--s-1);
    padding: var(--s-2) var(--s-3);
    background: var(--bg);
    min-width: 0;
  }
  .crew-label {
    font-family: var(--font-head);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--fg-dim);
  }
  @media (max-width: 520px) {
    .crew-trio { grid-template-columns: 1fr; }
    .crew-cell { flex-direction: row; align-items: center; justify-content: space-between; }
  }

  .warn {
    margin-top: var(--s-3);
    padding: var(--s-2) 0;
    color: var(--accent-bright);
    font-style: italic;
  }

  .upgrades { margin-top: var(--s-5); }
  .upgrade-list {
    list-style: none;
    margin: var(--s-2) 0 var(--s-3);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }
  .upgrade-list li {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-2) var(--s-3);
    background: var(--bg);
  }
  .upgrade-text { flex: 1 1 auto; font-family: var(--font-body); min-width: 0; word-break: break-word; }
  .upgrade-remove {
    width: 28px; height: 28px; line-height: 1;
    font-family: var(--font-mono); font-size: 1.1rem;
    color: var(--fg-dim);
    background: transparent; border: 0; cursor: pointer;
    flex-shrink: 0;
  }
  .upgrade-remove:hover { color: var(--accent-bright); }

  .upgrade-add {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--s-2);
  }
  .muted { color: var(--fg-dim); font-style: italic; margin: 0; }
</style>
