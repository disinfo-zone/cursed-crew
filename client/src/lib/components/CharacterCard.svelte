<script lang="ts">
  import type { Character, InventoryItem } from '$lib/shared/types';
  import type { CrewSession } from '$lib/ws-session.svelte';
  import { toasts } from '$lib/toasts.svelte';
  import Stepper from './Stepper.svelte';

  type Props = {
    session: CrewSession;
    character: Character;
    deceased: boolean;
    tilt: 'left' | 'right' | 'none';
    collapsed: boolean;
    onToggleCollapsed: () => void;
  };

  let { session, character, deceased, tilt, collapsed, onToggleCollapsed }: Props = $props();

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
  function confirmDeath() {
    session.dispatch({ kind: 'character.die', id: character.id });
    toasts.push('To Davy Jones\' locker with ye.', 'grim');
  }
  function revive() {
    session.dispatch({ kind: 'character.revive', id: character.id });
    toasts.push('The dead walk again.', 'info');
  }
  function permanentRemove() {
    session.dispatch({ kind: 'character.remove', id: character.id });
  }
</script>

<article
  class="card"
  class:dead={deceased}
  class:collapsed
  class:tilt-left={tilt === 'left' && !collapsed}
  class:tilt-right={tilt === 'right' && !collapsed}
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
    <!-- HP is paired (current / max), so it gets its own full-width row
         with compact steppers. Luck + Silver share the next row. -->
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

      <div class="ps-block ps-wide">
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
        <input
          class="input"
          type="text"
          maxlength="200"
          bind:value={invName}
          placeholder="cutlass, flintlock, rope, rum…"
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInventory(); } }}
        />
        <input
          class="input"
          type="text"
          maxlength="200"
          bind:value={invNotes}
          placeholder="notes (optional)"
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInventory(); } }}
        />
        <button type="button" class="btn" onclick={addInventory} disabled={invName.trim().length === 0}>Add</button>
      </div>
    </section>

    <footer class="card-foot">
      {#if deceased}
        <button type="button" class="btn btn-ghost" onclick={revive}>Revive</button>
        <button type="button" class="btn btn-ghost remove" onclick={permanentRemove}>
          Cast overboard
        </button>
      {:else}
        <button type="button" class="btn btn-ghost" onclick={confirmDeath}>Mark dead</button>
      {/if}
    </footer>
  {/if}
</article>

<style>
  .card {
    background: var(--bg-dim);
    border: var(--stroke-heavy) solid var(--ink-line);
    padding: var(--s-4);
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    min-width: 0;  /* allow shrinking inside grid */
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
    border-bottom: var(--stroke) solid var(--ink-line);
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
    border-bottom: var(--stroke-thin) dashed var(--fg-dim);
    padding: var(--s-1) 0;
    font-family: var(--font-display);
    font-size: clamp(1.15rem, 2.5vw, 1.75rem);
    color: var(--accent);
    letter-spacing: 0.02em;
  }
  .name-input:focus { outline: none; border-bottom-color: var(--accent); border-bottom-style: solid; }
  .collapse-btn {
    width: 32px;
    height: 32px;
    background: transparent;
    border: var(--stroke-thin) solid var(--fg-dim);
    color: var(--fg-dim);
    font-family: var(--font-mono);
    cursor: pointer;
  }
  .collapse-btn:hover { border-color: var(--fg); color: var(--fg); }

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
    border: var(--stroke) solid var(--ink-line);
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-head);
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-radius: 0;
    min-height: 36px;
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
    border: var(--stroke-thin) solid var(--accent);
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
    grid-template-columns: 1fr auto 1fr;
    gap: var(--s-2);
  }
  .ps-wide { grid-column: span 1; }
  .primary-stats .ps-wide:first-child { grid-column: 1 / -1; }
  .primary-stats .ps-wide:last-child { grid-column: 1 / -1; }
  /* When there are only 3 blocks total, middle block is Luck and flanks
     stretch automatically. The two ps-wide:* rules above collapse HP and
     Silver into their own rows; Luck sits in between on its own row too.
     That way nothing wraps in a narrow card. */
  .primary-stats {
    grid-template-columns: 1fr;  /* stack by default — each block full-width */
  }
  .ps-block {
    display: flex;
    flex-direction: row;
    gap: var(--s-3);
    padding: var(--s-2) var(--s-3);
    background: var(--bg);
    align-items: center;
    min-width: 0;
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
  .ps-pair { display: flex; align-items: center; gap: var(--s-1); flex-wrap: nowrap; }
  .slash { color: var(--fg-mute); font-family: var(--font-mono); font-size: 1.1rem; }

  /* ─── Ability grid ────────────────────────────────────────────────── */
  /* 5 abilities laid out as 2 columns. Each row shows the short label tight
   * beside the compact stepper; the odd one out (Spirit) takes a full row.
   * The compact stepper is ~120px wide, so two per row needs ~260px min —
   * fits every reasonable card width. */
  .ability-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-1);
  }
  .ability {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-1) var(--s-2);
    background: var(--bg);
    min-width: 0;
    overflow: hidden;
  }
  .ability:nth-child(5) { grid-column: 1 / -1; }
  .ab-label {
    font-family: var(--font-head);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--fg-dim);
    flex-shrink: 0;
    min-width: 2.2em;
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
    border: var(--stroke) solid var(--fg-dim);
    font-family: var(--font-head);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    cursor: pointer;
    min-height: 30px;
  }
  .cond:hover { color: var(--fg); border-color: var(--fg); }
  .cond.on { background: var(--accent); color: var(--c-bone); border-color: var(--accent); }
  .cond.custom { background: var(--c-status-watched); border-color: var(--c-status-watched); color: var(--c-bone); }
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
    color: var(--fg-dim); border: var(--stroke-thin) solid var(--fg-dim);
    background: transparent; cursor: pointer;
    font-family: var(--font-mono); font-size: 1rem;
    flex-shrink: 0;
  }
  .inv-remove:hover { background: var(--accent); color: var(--c-bone); border-color: var(--accent); }

  .inv-add {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) auto;
    gap: var(--s-2);
    margin-top: var(--s-2);
  }
  @media (max-width: 520px) {
    .inv-add { grid-template-columns: 1fr auto; }
    .inv-add input:first-child { grid-column: 1 / -1; }
  }

  /* ─── Footer ──────────────────────────────────────────────────────── */
  .card-foot {
    margin-top: var(--s-2);
    padding-top: var(--s-2);
    border-top: var(--stroke-thin) dashed var(--fg-dim);
    display: flex;
    gap: var(--s-2);
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .card-foot .btn { font-size: 0.75rem; min-height: 34px; padding: var(--s-1) var(--s-3); }
  .remove { color: var(--accent-bright); border-color: var(--accent-bright); }
  .remove:hover { background: var(--accent-bright); color: var(--c-bone); }
</style>
