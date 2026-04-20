<script lang="ts">
  import type { CrewSession } from '$lib/ws-session.svelte';
  import type { LogEntry } from '$lib/shared/types';
  import { renderMarkdownLite, todayIsoDate } from '$lib/markdownLite';

  type Props = { session: CrewSession };
  let { session }: Props = $props();

  const entries = $derived(session.data?.log ?? []);

  // Sort newest first by (session desc, date desc, id for stability).
  const sorted = $derived(
    [...entries].sort((a, b) => {
      if (a.session !== b.session) return b.session - a.session;
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    })
  );

  // New-entry form state
  const nextSession = $derived(
    entries.length === 0 ? 1 : Math.max(...entries.map((e) => e.session)) + 1
  );
  let newSession = $state(1);
  let newDate = $state(todayIsoDate());
  let newTitle = $state('');
  let newBody = $state('');
  let newAuthor = $state('');

  // Keep the session field auto-tracking nextSession unless the user has
  // explicitly changed it. (Simple heuristic: if newSession matches the
  // last-seen nextSession value, update it on change.)
  let lastAutoSession = $state(1);
  $effect(() => {
    if (newSession === lastAutoSession) {
      newSession = nextSession;
      lastAutoSession = nextSession;
    }
  });
  $effect(() => {
    if (!newAuthor && session.displayName) newAuthor = session.displayName;
  });

  function submitNew(ev: SubmitEvent) {
    ev.preventDefault();
    const title = newTitle.trim();
    const body = newBody.trim();
    if (!title && !body) return; // require at least one
    const author = newAuthor.trim() || session.displayName || '';
    session.dispatch({
      kind: 'log.add',
      id: crypto.randomUUID(),
      entry: {
        session: newSession,
        date: newDate || todayIsoDate(),
        title,
        body,
        author
      }
    });
    // Reset fields except session/date/author
    newTitle = '';
    newBody = '';
  }

  // Per-entry edit state
  let editingId = $state<string | null>(null);
  let editSession = $state(0);
  let editDate = $state('');
  let editTitle = $state('');
  let editBody = $state('');
  let editAuthor = $state('');

  function beginEdit(e: LogEntry) {
    editingId = e.id;
    editSession = e.session;
    editDate = e.date;
    editTitle = e.title;
    editBody = e.body;
    editAuthor = e.author;
  }
  function commitEdit() {
    if (!editingId) return;
    session.dispatch({
      kind: 'log.update',
      id: editingId,
      fields: {
        session: editSession,
        date: editDate,
        title: editTitle.trim(),
        body: editBody.trim(),
        author: editAuthor.trim()
      }
    });
    editingId = null;
  }
  function cancelEdit() {
    editingId = null;
  }
  function removeEntry(id: string) {
    session.dispatch({ kind: 'log.remove', id });
    if (editingId === id) editingId = null;
  }
</script>

<section class="panel log" aria-labelledby="log-h">
  <h2 id="log-h" class="panel-head">The Log</h2>

  <!-- New entry -->
  <form class="new-entry" onsubmit={submitNew}>
    <div class="new-top">
      <div class="field session-field">
        <label for="new-session">Session</label>
        <input
          id="new-session"
          class="input session-input"
          type="number"
          min="0"
          max="9999"
          bind:value={newSession}
        />
      </div>
      <div class="field date-field">
        <label for="new-date">Date</label>
        <input
          id="new-date"
          class="input"
          type="date"
          bind:value={newDate}
        />
      </div>
      <div class="field grow">
        <label for="new-title">Title</label>
        <input
          id="new-title"
          class="input"
          type="text"
          maxlength="80"
          bind:value={newTitle}
          placeholder="Into the Drowned Chapel"
        />
      </div>
      <div class="field author-field">
        <label for="new-author">Scribe</label>
        <input
          id="new-author"
          class="input"
          type="text"
          maxlength="40"
          bind:value={newAuthor}
        />
      </div>
    </div>
    <div class="field">
      <label for="new-body">What happened?</label>
      <textarea
        id="new-body"
        class="textarea new-body"
        maxlength="8000"
        bind:value={newBody}
        placeholder="Use **bold**, *italic*, and blank lines for paragraphs."
      ></textarea>
    </div>
    <div class="row new-submit">
      <span class="hint muted">Markdown-lite: <code>**bold**</code> <code>*italic*</code> · blank line for paragraph.</span>
      <button type="submit" class="btn btn-primary" disabled={!newTitle.trim() && !newBody.trim()}>
        Enter in the ledger
      </button>
    </div>
  </form>

  {#if sorted.length > 0}
    <hr class="rule" aria-hidden="true" />

    <ol class="entries" reversed>
      {#each sorted as entry (entry.id)}
        <li class="entry">
          {#if editingId === entry.id}
            <div class="edit">
              <div class="edit-top">
                <input class="input session-input" type="number" min="0" max="9999" bind:value={editSession} aria-label="Session" />
                <input class="input" type="date" bind:value={editDate} aria-label="Date" />
                <input class="input grow" type="text" maxlength="80" bind:value={editTitle} aria-label="Title" />
                <input class="input author-input" type="text" maxlength="40" bind:value={editAuthor} aria-label="Scribe" />
              </div>
              <textarea class="textarea" maxlength="8000" bind:value={editBody} aria-label="Body"></textarea>
              <div class="row">
                <button type="button" class="btn btn-primary" onclick={commitEdit}>Save</button>
                <button type="button" class="btn btn-ghost" onclick={cancelEdit}>Cancel</button>
              </div>
            </div>
          {:else}
            <header class="entry-head">
              <div class="stamp" aria-label="Session {entry.session}, {entry.date}">
                <span class="stamp-session">Session <span class="stat">{entry.session}</span></span>
                <span class="stamp-date stat">{entry.date}</span>
              </div>
              {#if entry.title}
                <h3 class="entry-title">{entry.title}</h3>
              {/if}
              <div class="entry-actions">
                <button type="button" class="entry-action" onclick={() => beginEdit(entry)}>edit</button>
                <button type="button" class="entry-action danger" onclick={() => removeEntry(entry.id)}>remove</button>
              </div>
            </header>
            {#if entry.body}
              <!-- body is HTML-escaped inside renderMarkdownLite before the
                   three allowed tags are re-hydrated. See markdownLite.ts. -->
              <div class="entry-body">
                {@html renderMarkdownLite(entry.body)}
              </div>
            {/if}
            {#if entry.author}
              <footer class="entry-foot">
                <span class="muted">— {entry.author}</span>
              </footer>
            {/if}
          {/if}
        </li>
      {/each}
    </ol>
  {:else}
    <p class="muted empty">Nothing logged yet. The paper waits.</p>
  {/if}
</section>

<style>
  .new-entry {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-4);
    border: var(--stroke) dashed var(--fg-dim);
    background: var(--bg);
  }
  .new-top {
    display: grid;
    grid-template-columns: 90px 150px 1fr 160px;
    gap: var(--s-3);
  }
  @media (max-width: 820px) {
    .new-top { grid-template-columns: 90px 150px 1fr; }
    .author-field { grid-column: 1 / -1; }
  }
  @media (max-width: 520px) {
    .new-top { grid-template-columns: 1fr 1fr; }
    .grow, .author-field { grid-column: 1 / -1; }
  }
  .session-input { width: 100%; }
  .grow { min-width: 0; }
  .new-body {
    min-height: 8rem;
  }
  .new-submit {
    justify-content: space-between;
    gap: var(--s-3);
  }
  .hint {
    font-size: 0.8rem;
  }
  .hint code {
    background: var(--bg-dim);
    padding: 0 var(--s-1);
    border: var(--stroke-thin) solid var(--fg-mute);
  }
  .muted { color: var(--fg-dim); font-style: italic; }
  .empty { padding: var(--s-6); text-align: center; }

  .entries {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
  }
  .entry {
    padding: var(--s-4) var(--s-5);
    background: var(--bg);
    border: var(--stroke-heavy) solid var(--ink-line);
    border-left-width: 6px;
    border-left-color: var(--accent);
    position: relative;
  }

  .entry-head {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--s-3);
    align-items: center;
    margin-bottom: var(--s-3);
  }
  @media (max-width: 560px) {
    .entry-head {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        "stamp   actions"
        "title   title";
    }
    .stamp { grid-area: stamp; }
    .entry-title { grid-area: title; }
    .entry-actions { grid-area: actions; }
  }
  .stamp {
    display: inline-flex;
    flex-direction: column;
    padding: var(--s-2) var(--s-3);
    border: var(--stroke-thin) solid var(--fg-dim);
    background: var(--bg-dim);
    line-height: 1.2;
  }
  .stamp-session {
    font-family: var(--font-head);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--fg-dim);
  }
  .stamp-date {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--fg);
  }
  .entry-title {
    font-family: var(--font-display);
    font-size: clamp(1.25rem, 2.5vw, 1.75rem);
    color: var(--accent);
    letter-spacing: 0.02em;
    margin: 0;
  }

  .entry-actions {
    display: inline-flex;
    gap: var(--s-1);
  }
  .entry-action {
    padding: var(--s-1) var(--s-2);
    background: transparent;
    border: var(--stroke-thin) solid var(--fg-dim);
    color: var(--fg-dim);
    font-family: var(--font-head);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    cursor: pointer;
  }
  .entry-action:hover {
    border-color: var(--fg);
    color: var(--fg);
  }
  .entry-action.danger:hover {
    background: var(--accent);
    color: var(--c-bone);
    border-color: var(--accent);
  }

  .entry-body {
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1.6;
  }
  .entry-body :global(p) {
    margin: 0 0 var(--s-3);
  }
  .entry-body :global(p:last-child) {
    margin-bottom: 0;
  }
  .entry-body :global(strong) {
    color: var(--fg);
    font-weight: 700;
  }
  .entry-body :global(em) {
    color: var(--fg);
  }

  .entry-foot {
    margin-top: var(--s-3);
    text-align: right;
  }

  .edit {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .edit-top {
    display: grid;
    grid-template-columns: 90px 150px 1fr 160px;
    gap: var(--s-2);
  }
  @media (max-width: 720px) {
    .edit-top { grid-template-columns: 90px 1fr; }
    .edit-top input:nth-child(3),
    .edit-top input:nth-child(4) { grid-column: 1 / -1; }
  }
  .edit textarea { min-height: 10rem; }
</style>
