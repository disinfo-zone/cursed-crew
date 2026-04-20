<script lang="ts">
  import type { CrewSession } from '$lib/ws-session.svelte';
  import type { CargoItem, Relic, RelicStatus } from '$lib/shared/types';
  import Stepper from './Stepper.svelte';

  type Props = { session: CrewSession };
  let { session }: Props = $props();

  const manifest = $derived(session.data?.manifest);
  const ship = $derived(session.data?.ship);
  const cargoUsed = $derived(manifest?.cargo.reduce((n, c) => n + c.slots, 0) ?? 0);
  const cargoMax = $derived(ship?.cargoMax ?? 0);
  const overCapacity = $derived(cargoUsed > cargoMax);

  // Doubloons
  let doubloonsDraft = $state<string>('');
  function commitDoubloons() {
    const n = parseInt(doubloonsDraft, 10);
    if (Number.isFinite(n) && n >= 0) {
      session.dispatch({ kind: 'doubloons.set', value: n });
    }
    doubloonsDraft = '';
  }
  function setDoubloons(v: number) {
    session.dispatch({ kind: 'doubloons.set', value: v });
  }

  // Cargo
  let cargoName = $state('');
  let cargoSlots = $state(1);
  let cargoNotes = $state('');
  function addCargo() {
    const name = cargoName.trim();
    if (!name) return;
    session.dispatch({
      kind: 'cargo.add',
      id: crypto.randomUUID(),
      item: { name, slots: cargoSlots, notes: cargoNotes.trim() }
    });
    cargoName = '';
    cargoSlots = 1;
    cargoNotes = '';
  }
  function updateCargo<K extends keyof CargoItem>(id: string, field: K, value: CargoItem[K]) {
    session.dispatch({
      kind: 'cargo.update',
      id,
      fields: { [field]: value } as Partial<CargoItem>
    });
  }

  // Relics
  let relicName = $state('');
  let relicDesc = $state('');
  let relicUses = $state<string>('');
  function addRelic() {
    const name = relicName.trim();
    if (!name) return;
    const rawUses = relicUses.trim();
    const uses = rawUses === '' ? null : parseInt(rawUses, 10);
    session.dispatch({
      kind: 'relic.add',
      id: crypto.randomUUID(),
      relic: {
        name,
        description: relicDesc.trim(),
        usesLeft: rawUses === '' ? null : (Number.isFinite(uses as number) ? (uses as number) : null),
        status: 'active'
      }
    });
    relicName = '';
    relicDesc = '';
    relicUses = '';
  }
  function updateRelic<K extends keyof Relic>(id: string, field: K, value: Relic[K]) {
    session.dispatch({
      kind: 'relic.update',
      id,
      fields: { [field]: value } as Partial<Relic>
    });
  }
  const RELIC_STATUSES: RelicStatus[] = ['active', 'depleted', 'destroyed'];

  const cargoTextTimers = new Map<string, ReturnType<typeof setTimeout>>();
  function debounceCargoText(id: string, field: 'name' | 'notes', value: string) {
    const key = `${id}:${field}`;
    const t = cargoTextTimers.get(key);
    if (t) clearTimeout(t);
    cargoTextTimers.set(
      key,
      setTimeout(() => updateCargo(id, field, value), 450)
    );
  }
  const relicTextTimers = new Map<string, ReturnType<typeof setTimeout>>();
  function debounceRelicText(id: string, field: 'name' | 'description', value: string) {
    const key = `${id}:${field}`;
    const t = relicTextTimers.get(key);
    if (t) clearTimeout(t);
    relicTextTimers.set(
      key,
      setTimeout(() => updateRelic(id, field, value), 450)
    );
  }
</script>

{#if manifest}
  <section class="panel manifest" aria-labelledby="manifest-h">
    <h2 id="manifest-h" class="panel-head">The Manifest</h2>

    <!-- Doubloons -->
    <section class="doubloons">
      <div class="doub-head">
        <span class="field-label">Doubloons</span>
        <span class="doub-value stat">{manifest.doubloons.toLocaleString()}</span>
      </div>
      <div class="doub-steppers">
        <Stepper
          value={manifest.doubloons}
          min={0}
          max={999_999_999}
          fastStep={10}
          label="Doubloons"
          onChange={setDoubloons}
        />
      </div>
      <div class="doub-set">
        <label class="field-label" for="doub-exact">Set exact</label>
        <input
          id="doub-exact"
          class="input"
          type="number"
          min="0"
          max="999999999"
          bind:value={doubloonsDraft}
          placeholder="any number"
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitDoubloons(); } }}
        />
        <button type="button" class="btn" onclick={commitDoubloons} disabled={doubloonsDraft.trim() === ''}>Set</button>
      </div>
    </section>

    <hr class="rule" aria-hidden="true" />

    <!-- Cargo -->
    <section class="cargo">
      <div class="subhead">
        <h3>Cargo</h3>
        <span class="slots" class:over={overCapacity}>
          <span class="stat">{cargoUsed}</span>
          <span class="muted">/ {cargoMax}</span> slots
        </span>
      </div>
      {#if overCapacity}
        <p class="warn">The hold is straining. She'll sail slow and heavy.</p>
      {/if}

      {#if manifest.cargo.length > 0}
        <ul class="cargo-list">
          {#each manifest.cargo as item (item.id)}
            <li>
              <input
                class="input cargo-name"
                type="text"
                maxlength="80"
                value={item.name}
                oninput={(e) => debounceCargoText(item.id, 'name', (e.currentTarget as HTMLInputElement).value)}
                onblur={(e) => updateCargo(item.id, 'name', (e.currentTarget as HTMLInputElement).value)}
                aria-label="Cargo name"
              />
              <div class="cargo-slots-stepper">
                <Stepper
                  value={item.slots}
                  min={0}
                  max={99}
                  label="slots"
                  onChange={(v) => updateCargo(item.id, 'slots', v)}
                  compact
                />
                <span class="slot-label">slots</span>
              </div>
              <input
                class="input cargo-notes"
                type="text"
                maxlength="200"
                value={item.notes}
                oninput={(e) => debounceCargoText(item.id, 'notes', (e.currentTarget as HTMLInputElement).value)}
                onblur={(e) => updateCargo(item.id, 'notes', (e.currentTarget as HTMLInputElement).value)}
                placeholder="notes (origin, buyer…)"
                aria-label="Cargo notes"
              />
              <button
                type="button"
                class="row-remove"
                aria-label="Remove cargo {item.name}"
                onclick={() => session.dispatch({ kind: 'cargo.remove', id: item.id })}
              >×</button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">The hold is empty.</p>
      {/if}

      <div class="cargo-add">
        <input
          class="input"
          type="text"
          maxlength="80"
          bind:value={cargoName}
          placeholder="rum barrels, sugar, stolen silks…"
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCargo(); } }}
        />
        <div class="add-slots">
          <span class="field-label tiny">slots</span>
          <Stepper
            value={cargoSlots}
            min={0}
            max={99}
            label="slots"
            onChange={(v) => (cargoSlots = v)}
            compact
          />
        </div>
        <input
          class="input"
          type="text"
          maxlength="200"
          bind:value={cargoNotes}
          placeholder="notes (optional)"
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCargo(); } }}
        />
        <button type="button" class="btn" onclick={addCargo} disabled={cargoName.trim() === ''}>Load</button>
      </div>
    </section>

    <hr class="rule" aria-hidden="true" />

    <!-- Relics -->
    <section class="relics">
      <div class="subhead">
        <h3>Relics</h3>
      </div>

      {#if manifest.relics.length > 0}
        <ul class="relic-list">
          {#each manifest.relics as relic (relic.id)}
            <li class="relic-card" data-status={relic.status}>
              <div class="relic-top">
                <input
                  class="input relic-name"
                  type="text"
                  maxlength="80"
                  value={relic.name}
                  oninput={(e) => debounceRelicText(relic.id, 'name', (e.currentTarget as HTMLInputElement).value)}
                  onblur={(e) => updateRelic(relic.id, 'name', (e.currentTarget as HTMLInputElement).value)}
                  aria-label="Relic name"
                />
                <button
                  type="button"
                  class="row-remove"
                  aria-label="Remove relic {relic.name}"
                  onclick={() => session.dispatch({ kind: 'relic.remove', id: relic.id })}
                >×</button>
              </div>

              <textarea
                class="textarea relic-desc"
                maxlength="8000"
                value={relic.description}
                oninput={(e) => debounceRelicText(relic.id, 'description', (e.currentTarget as HTMLTextAreaElement).value)}
                onblur={(e) => updateRelic(relic.id, 'description', (e.currentTarget as HTMLTextAreaElement).value)}
                placeholder="What it does, what it demands, what it whispers…"
              ></textarea>

              <div class="relic-foot">
                <div class="uses-pair">
                  <span class="field-label tiny">Uses</span>
                  <Stepper
                    value={relic.usesLeft ?? 0}
                    min={-1}
                    max={999}
                    label="Uses left"
                    onChange={(v) => updateRelic(relic.id, 'usesLeft', v)}
                    compact
                  />
                  <button
                    type="button"
                    class="uses-infinite"
                    class:on={relic.usesLeft === null}
                    onclick={() => updateRelic(relic.id, 'usesLeft', relic.usesLeft === null ? 0 : null)}
                    aria-pressed={relic.usesLeft === null}
                  >∞</button>
                </div>
                <div class="status-group">
                  <select
                    class="relic-status-select"
                    value={relic.status}
                    data-status={relic.status}
                    onchange={(e) => updateRelic(relic.id, 'status', (e.currentTarget as HTMLSelectElement).value as RelicStatus)}
                    aria-label="Relic status"
                  >
                    {#each RELIC_STATUSES as s (s)}
                      <option value={s}>{s}</option>
                    {/each}
                  </select>
                </div>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">No relics taken yet. The sea is generous; the cost is steeper.</p>
      {/if}

      <div class="relic-add">
        <input
          class="input"
          type="text"
          maxlength="80"
          bind:value={relicName}
          placeholder="Ashen Compass, The Drowning Eye…"
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRelic(); } }}
        />
        <input
          class="input"
          type="text"
          maxlength="200"
          bind:value={relicDesc}
          placeholder="description (optional)"
        />
        <input
          class="input uses-input"
          type="number"
          min="-1"
          max="999"
          bind:value={relicUses}
          placeholder="uses"
          aria-label="Relic uses"
        />
        <button type="button" class="btn" onclick={addRelic} disabled={relicName.trim() === ''}>Claim</button>
      </div>
    </section>
  </section>
{/if}

<style>
  .doubloons {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .doub-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
    flex-wrap: wrap;
  }
  .doub-value {
    font-family: var(--font-mono);
    font-size: clamp(1.75rem, 5vw, 2.75rem);
    color: var(--brass);
  }
  .doub-steppers {
    display: flex;
    justify-content: center;
  }
  .doub-set {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--s-2);
    align-items: center;
  }
  @media (max-width: 420px) {
    .doub-set {
      grid-template-columns: 1fr;
    }
    .doub-set label { margin-bottom: calc(-1 * var(--s-1)); }
  }
  .doub-set input { width: 100%; min-width: 0; }

  .subhead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: var(--s-3) 0;
    gap: var(--s-2);
    flex-wrap: wrap;
  }
  .subhead h3 {
    font-family: var(--font-head);
    font-size: 1rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .slots { font-family: var(--font-body); font-size: 0.9rem; color: var(--fg-dim); }
  .slots.over { color: var(--accent-bright); }
  .warn {
    padding: var(--s-2) var(--s-3);
    border-left: var(--stroke-heavy) solid var(--accent);
    color: var(--fg-dim); font-style: italic;
  }
  .muted { color: var(--fg-dim); font-style: italic; margin: 0; }

  .cargo-list, .relic-list {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column; gap: var(--s-2);
  }
  .cargo-list li {
    display: grid;
    grid-template-columns: minmax(8rem, 1.4fr) auto minmax(8rem, 2fr) auto;
    gap: var(--s-2);
    padding: var(--s-2);
    border: var(--stroke) solid var(--ink-line);
    background: var(--bg);
    align-items: center;
  }
  @media (max-width: 720px) {
    .cargo-list li {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        "name    remove"
        "slots   slots"
        "notes   notes";
    }
    .cargo-list .cargo-name  { grid-area: name; }
    .cargo-list .cargo-slots-stepper { grid-area: slots; justify-self: start; }
    .cargo-list .cargo-notes { grid-area: notes; }
    .cargo-list .row-remove  { grid-area: remove; }
  }
  .cargo-slots-stepper { display: inline-flex; align-items: center; gap: var(--s-1); }
  .slot-label { font-family: var(--font-head); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-dim); }

  .cargo-add {
    margin-top: var(--s-3);
    display: grid;
    grid-template-columns: minmax(10rem, 2fr) auto minmax(10rem, 2fr) auto;
    gap: var(--s-2);
    align-items: center;
  }
  @media (max-width: 720px) {
    .cargo-add {
      grid-template-columns: 1fr 1fr;
      grid-template-areas:
        "name      name"
        "slots     slots"
        "notes     notes"
        "submit    submit";
    }
    .cargo-add > input:nth-child(1) { grid-area: name; }
    .cargo-add .add-slots            { grid-area: slots; justify-self: start; }
    .cargo-add > input:nth-child(3) { grid-area: notes; }
    .cargo-add > button              { grid-area: submit; justify-self: stretch; }
  }
  .add-slots { display: inline-flex; align-items: center; gap: var(--s-1); }
  .tiny { font-size: 0.65rem; letter-spacing: 0.1em; }

  .relic-add {
    margin-top: var(--s-3);
    display: grid;
    grid-template-columns: minmax(10rem, 1.4fr) minmax(10rem, 2fr) 5rem auto;
    gap: var(--s-2);
  }
  @media (max-width: 720px) {
    .relic-add {
      grid-template-columns: 1fr 5rem;
      grid-template-areas:
        "name    name"
        "desc    desc"
        "uses    submit";
    }
    .relic-add > input:nth-child(1) { grid-area: name; }
    .relic-add > input:nth-child(2) { grid-area: desc; }
    .relic-add .uses-input          { grid-area: uses; }
    .relic-add > button             { grid-area: submit; }
  }
  .uses-input { min-width: 0; }

  .row-remove {
    width: 32px; height: 32px; line-height: 1;
    font-family: var(--font-mono); font-size: 1.1rem;
    background: transparent; color: var(--fg-dim);
    border: var(--stroke-thin) solid var(--fg-dim); cursor: pointer;
    flex-shrink: 0;
  }
  .row-remove:hover { background: var(--accent); color: var(--c-bone); border-color: var(--accent); }

  /* Relics */
  .relic-card {
    padding: var(--s-3);
    background: var(--bg);
    border-left: 6px solid var(--accent);
    display: flex; flex-direction: column; gap: var(--s-2);
  }
  .relic-card[data-status='active']    { border-left-color: var(--c-status-allied); }
  .relic-card[data-status='depleted']  { border-left-color: var(--c-status-watched); }
  .relic-card[data-status='destroyed'] { border-left-color: var(--c-status-kos); opacity: 0.7; }
  .relic-card[data-status='destroyed'] .relic-name,
  .relic-card[data-status='destroyed'] .relic-desc {
    text-decoration: line-through;
    text-decoration-color: var(--accent-dark);
  }

  .relic-top {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--s-2);
    align-items: center;
  }
  .relic-name {
    font-family: var(--font-head);
    font-size: 1rem;
    letter-spacing: 0.06em;
  }
  .relic-desc { min-height: 4rem; }

  .relic-foot {
    display: flex;
    gap: var(--s-3);
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .uses-pair { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
  .uses-infinite {
    min-width: 32px; min-height: 32px;
    font-family: var(--font-mono); font-size: 1.1rem;
    background: transparent; color: var(--fg-dim);
    border: var(--stroke-thin) solid var(--fg-dim); cursor: pointer;
  }
  .uses-infinite.on {
    background: var(--accent); color: var(--c-bone); border-color: var(--accent);
  }
  .status-group { display: inline-flex; }
  .relic-status-select {
    min-height: 32px;
    padding: 0 var(--s-6) 0 var(--s-3);
    border: var(--stroke) solid var(--ink-line);
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-head);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    border-radius: 0;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'><path d='M1 1 L6 6 L11 1' stroke='%23EFE3C8' stroke-width='1.5' fill='none'/></svg>");
    background-repeat: no-repeat;
    background-position: right var(--s-2) center;
  }
  .relic-status-select[data-status='active']    { background-color: var(--c-status-allied); color: var(--c-bone); border-color: var(--c-status-allied); }
  .relic-status-select[data-status='depleted']  { background-color: var(--c-status-watched); color: var(--c-bone); border-color: var(--c-status-watched); }
  .relic-status-select[data-status='destroyed'] { background-color: var(--c-status-kos); color: var(--c-bone); border-color: var(--c-status-kos); }
</style>
