<script lang="ts">
  import type { CrewData } from '$lib/shared/types';
  function genId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
  import Stepper from './Stepper.svelte';
  import ConfirmModal from './ConfirmModal.svelte';


  type Props = {
    ledger: CrewData;
    allowEdit: boolean;
    dispatch: (a: any) => void;
  };
  let { ledger, allowEdit, dispatch }: Props = $props();

  const m = $derived(ledger.manifest);

  let doubloonEdit = $state(false);
  let doubloonDraft = $state(0);
  let doubloonRef: HTMLInputElement | null = $state(null);

  // Confirmation modal state
  let confirm = $state<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {}
  });
  function askConfirm(title: string, message: string, onConfirm: () => void) {
    confirm = { open: true, title, message, onConfirm };
  }
  function closeConfirm() {
    confirm = { ...confirm, open: false };
  }

  function setDoubloons(n: number) {
    dispatch({ kind: 'doubloons.set', value: Math.max(0, Math.min(999999, n)) });
  }
  function updateCargo(id: string, fields: Partial<CrewData['manifest']['cargo'][number]>) {
    dispatch({ kind: 'cargo.update', id, fields });
  }
  function removeCargo(id: string) {
    dispatch({ kind: 'cargo.remove', id });
  }
  function confirmRemoveCargo(id: string) {
    askConfirm('Remove cargo?', 'This cargo will be lost to the sea.', () => removeCargo(id));
  }
  function addCargo() {
    dispatch({
      kind: 'cargo.add',
      id: genId(),
      item: { name: 'New Cargo', slots: 1, notes: '' }
    });
  }
  function updateRelic(id: string, fields: Partial<CrewData['manifest']['relics'][number]>) {
    dispatch({ kind: 'relic.update', id, fields });
  }
  function removeRelic(id: string) {
    dispatch({ kind: 'relic.remove', id });
  }
  function confirmRemoveRelic(id: string) {
    askConfirm('Remove relic?', 'This relic will be cast into the deep.', () => removeRelic(id));
  }
  function addRelic() {
    dispatch({
      kind: 'relic.add',
      id: genId(),
      relic: {
        name: 'Unnamed Relic',
        description: '',
        usesLeft: 1,
        status: 'active'
      }
    });
  }

  function cargoUsed() {
    return m.cargo.reduce((s, c) => s + c.slots, 0);
  }
  function isCargoOver() {
    return cargoUsed() > ledger.ship.cargoMax;
  }

  function startDoubloonEdit() {
    if (!allowEdit) return;
    doubloonEdit = true;
    doubloonDraft = m.doubloons;
    requestAnimationFrame(() => doubloonRef?.focus());
  }
  function commitDoubloonEdit() {
    setDoubloons(doubloonDraft);
    doubloonEdit = false;
  }
  function onDoubloonKey(e: KeyboardEvent) {
    if (e.key === 'Enter') commitDoubloonEdit();
    if (e.key === 'Escape') doubloonEdit = false;
  }
</script>

<section class="panel" aria-labelledby="manifest-head">
  <h2 class="panel-head" id="manifest-head">Manifest</h2>

  <!-- ═══════════════ DOUBLOONS ═══════════════ -->
  <div class="doubloon-block">
    <span class="doub-label">Doubloons</span>
    {#if doubloonEdit}
      <input
        bind:this={doubloonRef}
        class="doub-input"
        type="number"
        min="0"
        bind:value={doubloonDraft}
        onblur={commitDoubloonEdit}
        onkeydown={onDoubloonKey}
      />
    {:else}
      <button
        type="button"
        class="doub-value"
        onclick={startDoubloonEdit}
        disabled={!allowEdit}
        aria-label="Edit Doubloons"
        title="Click to edit"
      >{m.doubloons}</button>
    {/if}
    <Stepper label="Doubloons" min={0} max={999999} step={1} fastStep={10}
      value={m.doubloons}
      onChange={setDoubloons}
      disabled={!allowEdit}
      hideValue />
  </div>

  <!-- ═══════════════ CARGO ═══════════════ -->
  <hr class="rule" />

  <div class="section-head">
    <h3 class="section-title">Cargo</h3>
    <span class="cargo-meta" class:over={isCargoOver()}>
      {cargoUsed()} / {ledger.ship.cargoMax} slots
    </span>
    <button type="button" class="btn btn-sm" onclick={addCargo} disabled={!allowEdit}>
      Add Cargo
    </button>
  </div>
  <div class="cargo-grid">
    {#each m.cargo as c (c.id)}
      <div class="cargo-card">
        <div class="cargo-top">
          <input
            class="cargo-name"
            type="text"
            disabled={!allowEdit}
            value={c.name}
            onchange={(e) => updateCargo(c.id, { name: e.currentTarget.value })}
          />
          <button
            type="button"
            class="cargo-remove"
            aria-label="Remove cargo"
            onclick={() => confirmRemoveCargo(c.id)}
            disabled={!allowEdit}
          >×</button>
        </div>
        <div class="cargo-row">
          <span class="cargo-label">Slots</span>
          <Stepper label="Slots" min={1} max={999} step={1}
            value={c.slots}
            onChange={(v) => updateCargo(c.id, { slots: v })}
            disabled={!allowEdit} compact />
        </div>
        <textarea
          class="cargo-notes"
          disabled={!allowEdit}
          rows={2}
          value={c.notes}
          onchange={(e) => updateCargo(c.id, { notes: e.currentTarget.value })}
        ></textarea>
      </div>
    {/each}
  </div>

  <!-- ═══════════════ RELICS ═══════════════ -->
  <hr class="rule" />

  <div class="section-head">
    <h3 class="section-title">Relics</h3>
    <button type="button" class="btn btn-sm" onclick={addRelic} disabled={!allowEdit}>
      Add Relic
    </button>
  </div>
  <div class="relic-grid">
    {#each m.relics as r (r.id)}
      <div class="relic-card" data-status={r.status}>
        <div class="relic-top">
          <input
            class="relic-name"
            type="text"
            disabled={!allowEdit}
            value={r.name}
            onchange={(e) => updateRelic(r.id, { name: e.currentTarget.value })}
          />
          <button
            type="button"
            class="relic-remove"
            aria-label="Remove relic"
            onclick={() => confirmRemoveRelic(r.id)}
            disabled={!allowEdit}
          >×</button>
        </div>
        <div class="relic-row">
          <span class="relic-label">Charges</span>
          {#if r.usesLeft === null}
            <span class="relic-infinite">∞</span>
          {:else}
            <Stepper label="Charges" min={0} max={10} step={1}
              value={r.usesLeft}
              onChange={(v) => updateRelic(r.id, { usesLeft: v })}
              disabled={!allowEdit} compact />
          {/if}
          <label class="relic-toggle">
            <input
              type="checkbox"
              disabled={!allowEdit}
              checked={r.usesLeft === null}
              onchange={(e) => updateRelic(r.id, {
                usesLeft: e.currentTarget.checked ? null : 1
              })}
            />
            <span>∞</span>
          </label>
          <button
            type="button"
            class="relic-status"
            data-status={r.status}
            onclick={() => {
              const cycle = r.status === 'active' ? 'depleted' : r.status === 'depleted' ? 'destroyed' : 'active';
              updateRelic(r.id, { status: cycle });
            }}
            disabled={!allowEdit}
          >{r.status}</button>
        </div>
        <textarea
          class="relic-notes"
          disabled={!allowEdit}
          rows={2}
          value={r.description}
          onchange={(e) => updateRelic(r.id, { description: e.currentTarget.value })}
        ></textarea>
      </div>
    {/each}
  </div>

  <ConfirmModal
    open={confirm.open}
    title={confirm.title}
    message={confirm.message}
    onConfirm={() => { confirm.onConfirm(); closeConfirm(); }}
    onCancel={closeConfirm}
  />
</section>

<style>
  .section-head { display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap; margin-bottom:var(--s-4); }
  .section-title { font-family:var(--font-display); font-size:clamp(1.2rem, 2.5vw, 1.6rem); margin:0; letter-spacing:0.02em; }
  .cargo-meta { font-family:var(--font-mono); font-size:0.9rem; color:var(--fg-mute); }
  .cargo-meta.over { color: var(--accent-bright); }

  /* Doubloon block: inline-editable total */
  .doubloon-block {
    display: flex;
    align-items: center;
    gap: var(--s-4);
    flex-wrap: wrap;
    padding: var(--s-4) 0;
  }
  .doub-label {
    font-family: var(--font-head);
    font-size: 0.9rem;
    color: var(--fg-mute);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .doub-value {
    font-family: var(--font-mono);
    font-size: 2rem;
    line-height: 1;
    color: var(--fg);
    background: color-mix(in oklab, var(--fg) 6%, transparent);
    border: 0;
    padding: var(--s-1) var(--s-2);
    cursor: pointer;
    min-width: 4ch;
    text-align: center;
    border-radius: 0;
  }
  .doub-value:hover:not([disabled]) {
    background: color-mix(in oklab, var(--accent-bright) 10%, transparent);
    color: var(--accent-bright);
  }
  .doub-value[disabled] {
    cursor: default;
    opacity: 0.6;
  }
  .doub-input {
    font-family: var(--font-mono);
    font-size: 2rem;
    line-height: 1;
    color: var(--fg);
    background: color-mix(in oklab, var(--accent-bright) 10%, transparent);
    border: 0;
    padding: var(--s-1) var(--s-2);
    min-width: 4ch;
    text-align: center;
    border-radius: 0;
    outline: none;
    width: 6ch;
  }
  .doub-input:focus-visible {
    background: color-mix(in oklab, var(--accent-bright) 18%, transparent);
    outline: none;
  }

  .cargo-grid { display:grid; grid-template-columns:1fr; gap:var(--s-4); margin-bottom:var(--s-5); overflow:hidden; }
  @media (min-width: 640px) { .cargo-grid { grid-template-columns:repeat(2,1fr); } }
  @media (min-width: 1024px) { .cargo-grid { grid-template-columns:repeat(3,1fr); } }

  .cargo-card {
    background: var(--bg);
    padding: var(--s-4);
    position: relative;
  }
  .cargo-card:nth-child(odd) { transform: rotate(-0.25deg); }
  .cargo-card:nth-child(even) { transform: rotate(0.15deg); }
  @media (max-width: 639px) {
    .cargo-card:nth-child(odd),
    .cargo-card:nth-child(even) { transform: none; }
  }
  .cargo-top { display:flex; align-items:center; gap:var(--s-2); margin-bottom:var(--s-3); }
  .cargo-name { flex:1; font-family:var(--font-body); font-size:1rem; background:color-mix(in oklab, var(--fg) 3%, transparent); border:0; border-bottom:var(--stroke) solid var(--ink-line); padding:var(--s-1) var(--s-2); outline:none; color:var(--fg); min-width:0; }
  .cargo-name:focus-visible { border-bottom-color:var(--accent-bright); background:color-mix(in oklab, var(--fg) 6%, transparent); outline:none; }
  .cargo-remove { width:32px; height:32px; display:inline-grid; place-content:center; background:transparent; border:0; color:var(--fg-dim); font-size:1.25rem; cursor:pointer; line-height:1; border-radius:0; }
  .cargo-remove:hover { color:var(--accent-bright); }
  .cargo-row { display:flex; align-items:center; gap:var(--s-3); margin-bottom:var(--s-2); }
  .cargo-label { font-family:var(--font-head); font-size:0.8rem; color:var(--fg-mute); text-transform:uppercase; letter-spacing:0.06em; }
  .cargo-notes { width:100%; font-family:var(--font-body); font-size:0.9rem; background:color-mix(in oklab, var(--fg) 3%, transparent); border:0; border-bottom:var(--stroke) solid var(--ink-line); padding:var(--s-2); outline:none; color:var(--fg); resize:vertical; margin-top:var(--s-2); }
  .cargo-notes:focus-visible { border-bottom-color:var(--accent-bright); background:color-mix(in oklab, var(--fg) 6%, transparent); outline:none; }

  .relic-grid { display:grid; grid-template-columns:1fr; gap:var(--s-4); overflow:hidden; }
  @media (min-width: 640px) { .relic-grid { grid-template-columns:repeat(2,1fr); } }

  .relic-card {
    background: var(--bg);
    padding: var(--s-4);
    position: relative;
  }
  .relic-card:nth-child(odd) { transform: rotate(0.2deg); }
  .relic-card:nth-child(even) { transform: rotate(-0.3deg); }
  @media (max-width: 639px) {
    .relic-card:nth-child(odd),
    .relic-card:nth-child(even) { transform: none; }
  }
  /* Accent bar on the left only — reads as a rule, not a box */
  .relic-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: var(--s-2);
    bottom: var(--s-2);
    width: var(--stroke-heavy);
    background: var(--accent);
  }
  .relic-card[data-status="depleted"]::before { background: #8B5A2B; }
  .relic-card[data-status="destroyed"]::before { background: #555; }
  .relic-top { display:flex; align-items:center; gap:var(--s-2); margin-bottom:var(--s-3); }
  .relic-name { flex:1; font-family:var(--font-body); font-size:1rem; background:color-mix(in oklab, var(--fg) 3%, transparent); border:0; border-bottom:var(--stroke) solid var(--ink-line); padding:var(--s-1) var(--s-2); outline:none; color:var(--fg); min-width:0; }
  .relic-name:focus-visible { border-bottom-color:var(--accent-bright); background:color-mix(in oklab, var(--fg) 6%, transparent); outline:none; }
  .relic-remove { width:32px; height:32px; display:inline-grid; place-content:center; background:transparent; border:0; color:var(--fg-dim); font-size:1.25rem; cursor:pointer; line-height:1; border-radius:0; }
  .relic-remove:hover { color:var(--accent-bright); }
  .relic-row { display:flex; align-items:center; gap:var(--s-3); flex-wrap:wrap; margin-bottom:var(--s-2); }
  .relic-label { font-family:var(--font-head); font-size:0.8rem; color:var(--fg-mute); text-transform:uppercase; letter-spacing:0.06em; }
  .relic-infinite { font-family:var(--font-mono); font-size:1.1rem; color:var(--fg-dim); padding:0 var(--s-2); }
  .relic-toggle { display:inline-flex; align-items:center; gap:var(--s-1); cursor:pointer; font-family:var(--font-head); font-size:0.8rem; color:var(--fg-mute); text-transform:uppercase; letter-spacing:0.06em; }
  .relic-toggle input[type="checkbox"] { appearance:none; -webkit-appearance:none; width:18px; height:18px; border:0; background:var(--bg-dim); display:inline-grid; place-content:center; cursor:pointer; border-radius:0; margin:0; }
  .relic-toggle input[type="checkbox"]:checked { background:var(--accent); }
  .relic-toggle input[type="checkbox"]:checked::after { content:"∞"; font-size:10px; color:var(--c-bone); display:block; line-height:1; }
  .relic-toggle input[type="checkbox"]:focus-visible { outline:var(--ring) solid var(--accent-bright); outline-offset:2px; }
  .relic-notes { width:100%; font-family:var(--font-body); font-size:0.9rem; background:color-mix(in oklab, var(--fg) 3%, transparent); border:0; border-bottom:var(--stroke) solid var(--ink-line); padding:var(--s-2); outline:none; color:var(--fg); resize:vertical; margin-top:var(--s-2); }
  .relic-notes:focus-visible { border-bottom-color:var(--accent-bright); background:color-mix(in oklab, var(--fg) 6%, transparent); outline:none; }

  .relic-status {
    font-family: var(--font-head);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 2px var(--s-2);
    border: 0;
    background: var(--bg-dim);
    color: var(--fg);
    cursor: pointer;
    border-radius: 0;
  }
  .relic-status[data-status='active'] { background: var(--c-status-allied); color: var(--c-bone); }
  .relic-status[data-status='depleted'] { background: var(--c-status-watched); color: var(--c-bone); }
  .relic-status[data-status='destroyed'] { background: var(--c-status-kos); color: var(--c-bone); }
  .relic-status[disabled] { opacity: 0.5; cursor: not-allowed; }
</style>
