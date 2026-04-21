<script lang="ts">
  import type { CrewSession } from '$lib/ws-session.svelte';
  import type { Bounty } from '$lib/shared/types';
  import { toasts } from '$lib/toasts.svelte';
  import ConfirmModal from './ConfirmModal.svelte';

  type Props = { session: CrewSession };
  let { session }: Props = $props();

  const active = $derived(session.data?.bounties ?? []);
  const resolved = $derived(session.data?.bountiesResolved ?? []);

  // Auto-open Resolved when any exist so users see where a just-resolved
  // bounty went. The user can still toggle it off manually.
  let showResolvedOverride = $state<boolean | null>(null);
  const showResolved = $derived(
    showResolvedOverride ?? resolved.length > 0
  );

  // New bounty form
  let target = $state('');

  let confirm = $state<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {}
  });
  function askConfirm(title: string, message: string, onConfirm: () => void) {
    confirm = { open: true, title, message, onConfirm };
  }
  function closeConfirm() {
    confirm = { ...confirm, open: false };
  }
  let amount = $state<number | ''>('' as number | '');
  let issuer = $state('');
  let reason = $state('');

  function addBounty() {
    const t = target.trim();
    if (!t) return;
    const amt = typeof amount === 'number' ? amount : parseInt(String(amount) || '0', 10);
    session.dispatch({
      kind: 'bounty.add',
      id: crypto.randomUUID(),
      bounty: {
        target: t,
        amount: Number.isFinite(amt) ? amt : 0,
        issuer: issuer.trim(),
        reason: reason.trim(),
        status: 'active'
      }
    });
    target = '';
    amount = '' as number | '';
    issuer = '';
    reason = '';
  }

  function updateField<K extends keyof Bounty>(id: string, field: K, value: Bounty[K]) {
    session.dispatch({
      kind: 'bounty.update',
      id,
      fields: { [field]: value } as Partial<Bounty>
    });
  }

  const textTimers = new Map<string, ReturnType<typeof setTimeout>>();
  function debounceText(id: string, field: 'target' | 'issuer' | 'reason', value: string) {
    const key = `${id}:${field}`;
    const t = textTimers.get(key);
    if (t) clearTimeout(t);
    textTimers.set(key, setTimeout(() => updateField(id, field, value), 450));
  }

  function resolve(id: string, how: 'paid' | 'cleared') {
    session.dispatch({ kind: 'bounty.resolve', id, status: how });
    toasts.push(
      how === 'paid' ? 'Bounty paid in full.' : 'Bounty cleared from the books.',
      'info'
    );
  }

  function remove(id: string) {
    session.dispatch({ kind: 'bounty.remove', id });
    toasts.push('Struck from the warrants.', 'grim');
  }
  function confirmRemove(id: string, target: string) {
    askConfirm('Tear up the warrant?', `Remove the bounty on ${target || 'this target'}?`, () => remove(id));
  }
</script>

<section class="panel bounties" aria-labelledby="bounties-h">
  <h2 id="bounties-h" class="panel-head">The Bounties</h2>

  <!-- New bounty -->
  <form
    class="new-bounty"
    onsubmit={(e) => { e.preventDefault(); addBounty(); }}
  >
    <div class="new-grid">
      <div class="field">
        <label for="bnt-target">Target</label>
        <input
          id="bnt-target"
          class="input"
          type="text"
          maxlength="80"
          bind:value={target}
          placeholder="Blackbeard, One-Eye, the Ship Widow of the Wreck…"
        />
      </div>
      <div class="field">
        <label for="bnt-amount">Silver</label>
        <input
          id="bnt-amount"
          class="input"
          type="number"
          min="0"
          max="999999999"
          bind:value={amount}
          placeholder="0"
        />
      </div>
      <div class="field">
        <label for="bnt-issuer">Issuer</label>
        <input
          id="bnt-issuer"
          class="input"
          type="text"
          maxlength="80"
          bind:value={issuer}
          placeholder="British Crown, governor of Port Royal…"
        />
      </div>
      <div class="field grow">
        <label for="bnt-reason">Reason</label>
        <input
          id="bnt-reason"
          class="input"
          type="text"
          maxlength="200"
          bind:value={reason}
          placeholder="Piracy, blasphemy, a public grudge…"
        />
      </div>
    </div>
    <div class="row new-submit">
      <button type="submit" class="btn btn-primary" disabled={target.trim() === ''}>
        Post the warrant
      </button>
    </div>
  </form>

  {#if active.length > 0}
    <hr class="rule" aria-hidden="true" />
    <ul class="bounty-list">
      {#each active as b (b.id)}
        <li class="bounty-card active">
          <div class="bc-top">
            <input
              class="bc-target"
              type="text"
              maxlength="80"
              value={b.target}
              oninput={(e) => debounceText(b.id, 'target', (e.currentTarget as HTMLInputElement).value)}
              onblur={(e) => updateField(b.id, 'target', (e.currentTarget as HTMLInputElement).value)}
              aria-label="Target"
            />
            <span class="silver-amount stat">{b.amount.toLocaleString()} <span class="ag-sil">silver</span></span>
          </div>
          <div class="bc-mid">
            <input
              class="input"
              type="text"
              maxlength="80"
              value={b.issuer}
              oninput={(e) => debounceText(b.id, 'issuer', (e.currentTarget as HTMLInputElement).value)}
              onblur={(e) => updateField(b.id, 'issuer', (e.currentTarget as HTMLInputElement).value)}
              placeholder="issuer"
              aria-label="Issuer"
            />
            <input
              class="input"
              type="text"
              maxlength="200"
              value={b.reason}
              oninput={(e) => debounceText(b.id, 'reason', (e.currentTarget as HTMLInputElement).value)}
              onblur={(e) => updateField(b.id, 'reason', (e.currentTarget as HTMLInputElement).value)}
              placeholder="reason"
              aria-label="Reason"
            />
          </div>
          <div class="bc-foot">
            <button type="button" class="btn btn-ghost small" onclick={() => resolve(b.id, 'paid')}>Paid off</button>
            <button type="button" class="btn btn-ghost small" onclick={() => resolve(b.id, 'cleared')}>Cleared</button>
            <button type="button" class="btn btn-ghost small danger" onclick={() => confirmRemove(b.id, b.target)}>Remove</button>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted no-active">No warrants out. Yet.</p>
  {/if}

  {#if resolved.length > 0}
    <hr class="rule" aria-hidden="true" />
    <button
      type="button"
      class="resolved-toggle"
      onclick={() => (showResolvedOverride = !showResolved)}
      aria-expanded={showResolved}
    >
      <span>Resolved ({resolved.length})</span>
      <span class="caret" aria-hidden="true">{showResolved ? '▾' : '▸'}</span>
    </button>

    {#if showResolved}
      <ul class="bounty-list resolved-list">
        {#each resolved as b (b.id)}
          <li class="bounty-card resolved" data-status={b.status}>
            <div class="bc-top">
              <span class="bc-target-static">{b.target}</span>
              <span class="silver-amount stat">{b.amount.toLocaleString()} <span class="ag-sil">silver</span></span>
              <span class="tag" data-status={b.status === 'paid' ? 'allied' : 'neutral'}>
                {b.status === 'paid' ? 'Paid' : 'Cleared'}
              </span>
            </div>
            {#if b.issuer || b.reason}
              <div class="bc-mid-static">
                {#if b.issuer}<span class="muted">{b.issuer}</span>{/if}
                {#if b.issuer && b.reason}<span class="muted">·</span>{/if}
                {#if b.reason}<em>{b.reason}</em>{/if}
              </div>
            {/if}
            <div class="bc-foot">
              <button type="button" class="btn btn-ghost small danger" onclick={() => confirmRemove(b.id, b.target)}>Remove</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <ConfirmModal
    open={confirm.open}
    title={confirm.title}
    message={confirm.message}
    onConfirm={() => { confirm.onConfirm(); closeConfirm(); }}
    onCancel={closeConfirm}
  />
</section>

<style>
  .new-bounty {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-4);
    background: var(--bg);
  }
  .new-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 2fr 3fr;
    gap: var(--s-3);
  }
  @media (max-width: 820px) {
    .new-grid { grid-template-columns: 1fr 1fr; }
    .grow { grid-column: 1 / -1; }
  }
  @media (max-width: 480px) {
    .new-grid { grid-template-columns: 1fr; }
  }
  .new-submit { justify-content: flex-end; }

  .muted { color: var(--fg-dim); font-style: italic; margin: 0; }
  .no-active { padding: var(--s-6); text-align: center; }

  .bounty-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .bounty-card {
    padding: var(--s-3);
    background: var(--bg);
    border-left: 6px solid var(--accent);
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .bounty-card.resolved {
    border-left-color: var(--c-status-neutral);
    opacity: 0.85;
  }
  .bounty-card.resolved[data-status='paid'] { border-left-color: var(--c-status-allied); }
  .bounty-card.resolved[data-status='cleared'] { border-left-color: var(--c-status-watched); }

  .bc-top {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    flex-wrap: wrap;
  }
  .bc-target {
    flex: 1 1 12rem;
    min-width: 0;
    background: transparent;
    border: 0;
    border-bottom: var(--stroke-thin) solid var(--fg-dim);
    padding: var(--s-1) var(--s-2);
    font-family: var(--font-display);
    font-size: clamp(1.1rem, 2vw, 1.5rem);
    color: var(--accent);
    letter-spacing: 0.02em;
  }
  .bc-target:focus {
    outline: none;
    border-bottom-color: var(--accent);
  }
  .bc-target-static {
    font-family: var(--font-display);
    font-size: clamp(1.1rem, 2vw, 1.5rem);
    color: var(--accent);
    flex: 1;
  }
  .silver-amount {
    font-family: var(--font-mono);
    color: var(--brass);
    font-size: 1.1rem;
    white-space: nowrap;
  }
  .ag-sil {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: var(--fg-dim);
    margin-left: var(--s-1);
  }

  .bc-mid {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: var(--s-2);
  }
  @media (max-width: 640px) {
    .bc-mid { grid-template-columns: 1fr; }
  }
  .bc-mid-static {
    display: flex;
    gap: var(--s-2);
    flex-wrap: wrap;
    align-items: baseline;
  }

  .bc-foot {
    display: flex;
    gap: var(--s-2);
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .btn.small {
    font-size: 0.75rem;
    min-height: 34px;
    padding: var(--s-1) var(--s-3);
    letter-spacing: 0.1em;
  }
  .btn.danger {
    color: var(--accent-bright);
  }
  .btn.danger:hover {
    color: var(--accent);
    text-decoration: underline;
  }

  .resolved-toggle {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-2) var(--s-3);
    border: 0;
    background: transparent;
    color: var(--fg-dim);
    cursor: pointer;
    font-family: var(--font-head);
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    width: 100%;
    justify-content: space-between;
  }
  .resolved-toggle:hover {
    color: var(--fg);
    text-decoration: underline;
  }
  .resolved-toggle:focus-visible {
    outline: var(--ring) solid var(--accent-bright);
    outline-offset: 2px;
  }
  .resolved-list {
    margin-top: var(--s-3);
  }
  .caret {
    font-family: var(--font-mono);
  }
</style>
