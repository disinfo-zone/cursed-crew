<script lang="ts">
  import type { Character, InventoryItem } from '$lib/shared/types';
  import type { CrewSession } from '$lib/ws-session.svelte';
  import { toasts } from '$lib/toasts.svelte';
  import ConfirmModal from './ConfirmModal.svelte';
  import Stepper from './Stepper.svelte';

  type Props = {
    session: CrewSession;
    character: Character;
    deceased: boolean;

    collapsed: boolean;
    onToggleCollapsed: () => void;
  };

  let { session, character, deceased, collapsed, onToggleCollapsed }: Props = $props();

  /* Stable micro-rotation per character — like papers tossed on a table */
  const rotation = $derived(
    ((character.id.charCodeAt(0) + character.id.charCodeAt(3)) % 9 - 4) * 0.12
  );

  const CLASSES = [
    'Rapscallion', 'Swashbuckler', 'Brute', 'Zealot', 'Sorcerer',
    'Buccaneer', 'Tall Tale', 'Haunted Soul', 'Other'
  ];

  const DEFAULT_CONDITIONS = [
    'Broken', 'Bleeding', 'Infected', 'Poisoned', 'Stunned', 'Drunk', 'Cursed'
  ];

  const STATS: Array<{ key: keyof Character; label: string; short: string }> = [
    { key: 'agility',    label: 'Agility',    short: 'AGI' },
    { key: 'presence',   label: 'Presence',   short: 'PRE' },
    { key: 'strength',   label: 'Strength',   short: 'STR' },
    { key: 'toughness',  label: 'Toughness',  short: 'TGH' },
    { key: 'spirit',     label: 'Spirit',     short: 'SPR' }
  ];

  let nameTimer: ReturnType<typeof setTimeout> | null = null;
  let notesTimer: ReturnType<typeof setTimeout> | null = null;

  function updateField<K extends keyof Character>(field: K, value: Character[K]) {
    session.dispatch({
      kind: 'character.update',
      id: character.id,
      fields: { [field]: value } as Partial<Character>
    });
  }

  function debounceField<K extends keyof Character>(
    field: K,
    value: Character[K],
    which: 'name' | 'notes'
  ) {
    const timer = which === 'name' ? nameTimer : notesTimer;
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => updateField(field, value), 450);
    if (which === 'name') nameTimer = t;
    else notesTimer = t;
  }

  function toggleCondition(cond: string) {
    const set = new Set(character.conditions);
    if (set.has(cond)) set.delete(cond);
    else set.add(cond);
    updateField('conditions', [...set]);
  }

  let customCond = $state('');
  function addCustom() {
    const text = customCond.trim();
    if (!text) return;
    const set = new Set(character.conditions);
    set.add(text);
    updateField('conditions', [...set]);
    customCond = '';
  }

  // ─── Inventory ───────────────────────────────────────────────────────
  let invName = $state('');
  let invNotes = $state('');
  function addInventory() {
    const name = invName.trim();
    if (!name) return;
    const item: InventoryItem = { id: crypto.randomUUID(), name, notes: invNotes.trim() };
    updateField('inventory', [...character.inventory, item]);
    invName = '';
    invNotes = '';
  }
  function removeInventory(id: string) {
    updateField('inventory', character.inventory.filter((i) => i.id !== id));
  }
  const invTimers = new Map<string, ReturnType<typeof setTimeout>>();
  function debounceInventory(id: string, field: 'name' | 'notes', value: string) {
    const key = `${id}:${field}`;
    const t = invTimers.get(key);
    if (t) clearTimeout(t);
    invTimers.set(
      key,
      setTimeout(() => {
        const next = character.inventory.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        );
        updateField('inventory', next);
      }, 450)
    );
  }

  // ─── Death / revive ──────────────────────────────────────────────────
  function doDeath() {
    session.dispatch({ kind: 'character.die', id: character.id });
    toasts.push('To Davy Jones\' locker with ye.', 'grim');
  }
  function revive() {
    session.dispatch({ kind: 'character.revive', id: character.id });
    toasts.push('The dead walk again.', 'info');
  }
  function doPermanentRemove() {
    session.dispatch({ kind: 'character.remove', id: character.id });
  }

  let confirm = $state<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {}
  });
  function askConfirm(title: string, message: string, onConfirm: () => void) {
    confirm = { open: true, title, message, onConfirm };
  }
  function closeConfirm() {
    confirm = { ...confirm, open: false };
  }
</script>

<article
  class="card"
  class:dead={deceased}
  class:collapsed
  style:transform={`rotate(${rotation}deg)`}
  aria-label="Character: {character.name || 'Unnamed'}"
>
  <header class="card-head">
    <div class="name-row">
      <input
        class="name-input"
        type="text"
        maxlength="80"
        value={character.name}
        oninput={(e) => debounceField('name', (e.currentTarget as HTMLInputElement).value, 'name')}
        onblur={(e) => updateField('name', (e.currentTarget as HTMLInputElement).value)}
        placeholder="Unnamed"
        aria-label="Character name"
      />
      <button
        type="button"
        class="collapse-btn"
        onclick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand card' : 'Collapse card'}
        title={collapsed ? 'Expand' : 'Collapse'}
      >{collapsed ? '▸' : '▾'}</button>
    </div>
    <div class="meta-row">
      <select
        class="class-select"
        value={CLASSES.includes(character.class) ? character.class : 'Other'}
        onchange={(e) => {
          const v = (e.currentTarget as HTMLSelectElement).value;
          updateField('class', v === 'Other' && !CLASSES.includes(character.class) ? character.class : v);
        }}
        aria-label="Class"
      >
        {#each CLASSES as c (c)}
          <option value={c}>{c}</option>
        {/each}
        {#if !CLASSES.includes(character.class)}
          <option value={character.class}>{character.class}</option>
        {/if}
      </select>
      <span class="level-pair">
        <span class="lvl-label">Lvl</span>
        <Stepper
          value={character.level}
          min={0}
          max={20}
          label="Level"
          onChange={(v) => updateField('level', v)}
          compact
        />
      </span>
    </div>
  </header>

  {#if collapsed}
    <!-- Collapsed card: one compact row with live steppers for HP / Luck /
         Silver, plus condition chips. Designed for quick bedside-table
         adjustments without needing to expand the whole card. -->
    <div class="collapsed-body">
      <div class="mini">
        <span class="mini-label">HP</span>
        <Stepper
          value={character.hp}
          min={-99}
          max={character.maxHp > 0 ? character.maxHp : 999}
          label="HP"
          onChange={(v) => updateField('hp', v)}
          compact
        />
        <span class="mini-max">/<span class="stat">{character.maxHp}</span></span>
      </div>
      <div class="mini">
        <span class="mini-label">Luck</span>
        <Stepper
          value={character.devilsLuck}
          min={0}
          max={99}
          label="Devil's Luck"
          onChange={(v) => updateField('devilsLuck', v)}
          compact
        />
      </div>
      <div class="mini">
        <span class="mini-label">Silver</span>
        <Stepper
          value={character.silver}
          min={0}
          max={999_999}
          fastStep={10}
          label="Silver"
          onChange={(v) => updateField('silver', v)}
          compact
        />
      </div>
      {#if character.conditions.length > 0}
        <div class="cond-chip-row">
          {#each character.conditions as c (c)}
            <span class="cond-chip">{c}</span>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <!-- Full body ─────────────────────────────────────────────────────── -->
    <div class="primary-stats">
      <div class="ps-block ps-wide">
        <span class="ps-name">HP</span>
        <div class="ps-pair">
          <Stepper
            value={character.hp}
            min={-99}
            max={character.maxHp > 0 ? character.maxHp : 999}
            label="HP"
            onChange={(v) => updateField('hp', v)}
            compact
          />
          <span class="slash">/</span>
          <Stepper
            value={character.maxHp}
            min={1}
            max={999}
            label="Max HP"
            onChange={(v) => updateField('maxHp', v)}
            compact
          />
        </div>
      </div>

      <div class="ps-block">
        <span class="ps-name">Luck</span>
        <Stepper
          value={character.devilsLuck}
          min={0}
          max={99}
          label="Devil's Luck"
          onChange={(v) => updateField('devilsLuck', v)}
          compact
        />
      </div>

      <div class="ps-block">
        <span class="ps-name">Silver</span>
        <Stepper
          value={character.silver}
          min={0}
          max={999_999}
          fastStep={10}
          label="Silver"
          onChange={(v) => updateField('silver', v)}
          compact
        />
      </div>
    </div>

    <div class="ability-grid">
      {#each STATS as s (s.key)}
        <div class="ability">
          <span class="ab-label" title={s.label}>{s.short}</span>
          <Stepper
            value={character[s.key] as number}
            min={-10}
            max={30}
            label={s.label}
            onChange={(v) => updateField(s.key, v as Character[typeof s.key])}
            compact
          />
        </div>
      {/each}
    </div>

    <section class="conditions">
      <div class="conditions-head">
        <span class="field-label">Conditions</span>
        {#if character.conditions.length > 0}
          <button
            type="button"
            class="clear-all"
            onclick={() => updateField('conditions', [])}
            aria-label="Clear all conditions"
          >clear</button>
        {/if}
      </div>
      <div class="cond-row">
        {#each DEFAULT_CONDITIONS as cond (cond)}
          <button
            type="button"
            class="cond"
            class:on={character.conditions.includes(cond)}
            onclick={() => toggleCondition(cond)}
            aria-pressed={character.conditions.includes(cond)}
          >{cond}</button>
        {/each}
        {#each character.conditions.filter((c) => !DEFAULT_CONDITIONS.includes(c)) as cond (cond)}
          <button
            type="button"
            class="cond on custom"
            onclick={() => toggleCondition(cond)}
            aria-pressed="true"
          >{cond}</button>
        {/each}
      </div>
      <div class="cond-add">
        <input
          class="input"
          type="text"
          maxlength="80"
          bind:value={customCond}
          placeholder="custom (press Enter)"
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
        />
      </div>
    </section>

    <section class="feature">
      <label for="feat-{character.id}" class="field-label">Class feature · notes</label>
      <textarea
        id="feat-{character.id}"
        class="textarea"
        maxlength="8000"
        value={character.featureNotes}
        oninput={(e) => debounceField('featureNotes', (e.currentTarget as HTMLTextAreaElement).value, 'notes')}
        onblur={(e) => updateField('featureNotes', (e.currentTarget as HTMLTextAreaElement).value)}
        placeholder="Weapon specials, class ability cooldowns, oaths sworn…"
      ></textarea>
    </section>

    <section class="inventory">
      <span class="field-label">Inventory</span>
      {#if character.inventory.length > 0}
        <ul>
          {#each character.inventory as item (item.id)}
            <li>
              <input
                class="input inv-name"
                type="text"
                maxlength="200"
                value={item.name}
                oninput={(e) => debounceInventory(item.id, 'name', (e.currentTarget as HTMLInputElement).value)}
                onblur={(e) => {
                  const v = (e.currentTarget as HTMLInputElement).value;
                  const next = character.inventory.map((x) => x.id === item.id ? { ...x, name: v } : x);
                  updateField('inventory', next);
                }}
                aria-label="Item name"
              />
              <input
                class="input inv-notes"
                type="text"
                maxlength="200"
                value={item.notes}
                oninput={(e) => debounceInventory(item.id, 'notes', (e.currentTarget as HTMLInputElement).value)}
                onblur={(e) => {
                  const v = (e.currentTarget as HTMLInputElement).value;
                  const next = character.inventory.map((x) => x.id === item.id ? { ...x, notes: v } : x);
                  updateField('inventory', next);
                }}
                placeholder="notes (quirks, curses, charges…)"
                aria-label="Item notes"
              />
              <button
                type="button"
                class="inv-remove"
                aria-label="Remove {item.name}"
                onclick={() => removeInventory(item.id)}
              >×</button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="inv-add">
        <div class="add-col">
          <label class="add-label" for="inv-name-{character.id}">Item</label>
          <input
            id="inv-name-{character.id}"
            class="input"
            type="text"
            maxlength="200"
            bind:value={invName}
            placeholder="cutlass, flintlock…"
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInventory(); } }}
          />
        </div>
        <div class="add-col">
          <label class="add-label" for="inv-notes-{character.id}">Notes</label>
          <input
            id="inv-notes-{character.id}"
            class="input"
            type="text"
            maxlength="200"
            bind:value={invNotes}
            placeholder="quirks, curses, charges…"
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInventory(); } }}
          />
        </div>
        <button type="button" class="btn add-btn" onclick={addInventory} disabled={invName.trim().length === 0}>Add</button>
      </div>
    </section>

    <footer class="card-foot">
      {#if deceased}
        <button type="button" class="btn btn-ghost" onclick={revive}>Revive</button>
        <button type="button" class="btn btn-ghost remove" onclick={() => askConfirm('Cast overboard?', `${character.name || 'This character'} will be lost forever.`, doPermanentRemove)}>
          Cast overboard
        </button>
      {:else}
        <button type="button" class="btn btn-ghost" onclick={() => askConfirm('Mark dead?', `${character.name || 'This character'} will be moved to Davy Jones' Locker.`, doDeath)}>Mark dead</button>
      {/if}
    </footer>
  {/if}

  <ConfirmModal
    open={confirm.open}
    title={confirm.title}
    message={confirm.message}
    onConfirm={() => { confirm.onConfirm(); closeConfirm(); }}
    onCancel={closeConfirm}
  />
</article>

<style>
  .card {
    background: var(--bg-dim);
    padding: var(--s-4);
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    min-width: 0;  /* allow shrinking inside grid */
  }
  @media (max-width: 639px) {
    .card { border-bottom: var(--stroke) solid var(--ink-line); }
  }
  .card.dead { opacity: 0.75; background: var(--bg-deep); }
  .card.dead .name-input,
  .card.dead .inventory ul .inv-name,
  .card.dead .feature textarea {
    text-decoration: line-through;
    text-decoration-color: var(--accent-dark);
  }

  .card-head {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding-bottom: var(--s-2);
  }
  .name-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--s-2);
    align-items: center;
  }
  .name-input {
    width: 100%;
    min-width: 0;
    background: transparent;
    border: 0;
    border-bottom: var(--stroke-thin) solid var(--fg-dim);
    padding: var(--s-1) var(--s-2);
    font-family: var(--font-display);
    font-size: clamp(1.15rem, 2.5vw, 1.75rem);
    color: var(--accent);
    letter-spacing: 0.02em;
  }
  .name-input:focus {
    outline: none;
    border-bottom-color: var(--accent);
    text-shadow: 0.5px 0 0 color-mix(in oklab, var(--accent) 30%, transparent);
  }
  .collapse-btn {
    width: 44px;
    height: 44px;
    background: transparent;
    border: 0;
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: 1.25rem;
    cursor: pointer;
    display: inline-grid;
    place-content: center;
    transition: background 80ms linear, color 80ms linear;
  }
  .collapse-btn:hover { color: var(--fg); background: color-mix(in oklab, var(--fg) 6%, transparent); }

  .meta-row {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    flex-wrap: wrap;
  }
  .class-select {
    flex: 1;
    min-width: 0;
    padding: var(--s-2);
    border: 0;
    border-bottom: var(--stroke) solid var(--ink-line);
    background: color-mix(in oklab, var(--fg) 3%, transparent);
    color: var(--fg);
    font-family: var(--font-head);
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-radius: 0;
    min-height: 36px;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'><path d='M1 1 L6 6 L11 1' stroke='currentColor' stroke-width='1.5' fill='none'/></svg>");
    background-repeat: no-repeat;
    background-position: right var(--s-2) center;
    padding-right: var(--s-6);
    outline: none;
  }
  .class-select:focus {
    border-bottom-color: var(--accent-bright);
    background: color-mix(in oklab, var(--fg) 6%, transparent);
  }
  .level-pair { display: inline-flex; align-items: center; gap: var(--s-1); flex-shrink: 0; }
  .lvl-label { font-family: var(--font-head); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-dim); }

  /* ─── Collapsed body ──────────────────────────────────────────────── */
  .collapsed-body {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2) var(--s-4);
    align-items: center;
  }
  .mini {
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
  }
  .mini-label {
    font-family: var(--font-head);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--fg-dim);
  }
  .mini-max {
    font-family: var(--font-mono);
    color: var(--fg-mute);
    font-size: 0.85rem;
  }
  .cond-chip-row {
    flex-basis: 100%;
    display: flex;
    gap: var(--s-1);
    flex-wrap: wrap;
    margin-top: var(--s-1);
  }
  .cond-chip {
    display: inline-flex;
    align-items: center;
    padding: 2px var(--s-2);
    color: var(--c-bone);
    background: var(--accent);
    font-family: var(--font-head);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  /* ─── Primary stats (HP / Luck / Silver) ──────────────────────────── */
  .primary-stats {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--s-2);
    margin-bottom: var(--s-3);
  }
  /* In the masonry layout cards are often ~300-400px wide.
     Keep everything stacked so nothing wraps or overflows. */
  .ps-block {
    display: flex;
    flex-direction: row;
    gap: var(--s-3);
    padding: var(--s-2) var(--s-3);
    background: var(--bg);
    align-items: center;
    min-width: 0;
    flex-wrap: wrap;
  }
  .ps-name {
    font-family: var(--font-head);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--fg-dim);
    flex-shrink: 0;
    min-width: 3.5rem;
  }
  .ps-pair { display: flex; align-items: center; gap: var(--s-2); flex-wrap: nowrap; }
  .slash { color: var(--fg-mute); font-family: var(--font-mono); font-size: 1.1rem; }

  /* ─── Ability grid ────────────────────────────────────────────────── */
  .ability-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--s-2);
  }
  /* Only go 2-up when there is enough room; never 3-up inside cards
     because masonry columns are too narrow. */
  @media (min-width: 340px) {
    .ability-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .ability {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    padding: var(--s-2) var(--s-3);
    background: var(--bg);
    min-width: 0;
  }
  .ab-label {
    font-family: var(--font-head);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--fg-dim);
    flex-shrink: 0;
  }

  /* ─── Conditions ──────────────────────────────────────────────────── */
  .conditions-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--s-1); }
  .clear-all {
    font-family: var(--font-head); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--fg-dim); background: transparent; border: 0; cursor: pointer; padding: var(--s-1);
  }
  .clear-all:hover { color: var(--accent); }

  .cond-row { display: flex; gap: var(--s-1); flex-wrap: wrap; }
  .cond {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px var(--s-3);
    background: transparent;
    color: var(--fg-dim);
    border: 0;
    font-family: var(--font-head);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    cursor: pointer;
    min-height: 30px;
  }
  .cond:hover { color: var(--fg); }
  .cond.on { background: var(--accent); color: var(--c-bone); }
  .cond.custom { background: var(--c-status-watched); color: var(--c-bone); }
  .cond-add { margin-top: var(--s-2); }
  .cond-add input { width: 100%; min-height: 36px; }

  .feature { display: flex; flex-direction: column; gap: var(--s-1); }
  .feature textarea { min-height: 4.5rem; }

  /* ─── Inventory ───────────────────────────────────────────────────── */
  .inventory ul {
    list-style: none;
    padding: 0;
    margin: var(--s-2) 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .inventory li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) auto;
    gap: var(--s-1);
    align-items: center;
  }
  @media (max-width: 520px) {
    .inventory li {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        "name   remove"
        "notes  notes";
    }
    .inv-name   { grid-area: name; }
    .inv-notes  { grid-area: notes; }
    .inv-remove { grid-area: remove; }
  }
  .inv-name { font-family: var(--font-body); }
  .inv-notes { font-family: var(--font-body); font-style: italic; color: var(--fg-dim); }
  .inv-remove {
    width: 28px; height: 28px; line-height: 1;
    color: var(--fg-dim); border: 0;
    background: transparent; cursor: pointer;
    font-family: var(--font-mono); font-size: 1rem;
    flex-shrink: 0;
  }
  .inv-remove:hover { color: var(--accent-bright); }

  .inv-add {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) auto;
    gap: var(--s-2);
    margin-top: var(--s-3);
    align-items: end;
  }
  .add-col {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    min-width: 0;
  }
  .add-label {
    font-family: var(--font-head);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--fg-dim);
  }
  .add-btn { min-height: var(--tap-min); }
  @media (max-width: 520px) {
    .inv-add { grid-template-columns: 1fr auto; }
    .inv-add > .add-col:first-of-type { grid-column: 1 / -1; }
  }

  /* ─── Footer ──────────────────────────────────────────────────────── */
  .card-foot {
    margin-top: var(--s-2);
    padding-top: var(--s-2);
    display: flex;
    gap: var(--s-2);
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .card-foot .btn { font-size: 0.75rem; min-height: 34px; padding: var(--s-1) var(--s-3); }
  .remove { color: var(--accent-bright); }
  .remove:hover { color: var(--accent); text-decoration: underline; }
</style>
