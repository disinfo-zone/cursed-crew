<script lang="ts">
  type Props = {
    open: boolean;
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  };
  let {
    open,
    title = 'Are you sure?',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel
  }: Props = $props();

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div class="modal-backdrop" onclick={onCancel} role="presentation" aria-hidden="true">
    <div
      class="modal-panel"
      role="alertdialog"
      aria-modal="true"
      tabindex="-1"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-msg"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="modal-head" id="confirm-title">{title}</div>
      <div class="modal-body" id="confirm-msg">
        <p>{message}</p>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" onclick={onCancel}>{cancelLabel}</button>
        <button type="button" class="btn btn-primary" onclick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: color-mix(in oklab, var(--bg-deep) 85%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--s-4);
  }
  .modal-panel {
    background: var(--bg);
    width: 100%;
    max-width: 28rem;
    box-shadow: none;
    border-radius: 0;
  }
  .modal-head {
    background: var(--accent);
    color: var(--c-bone);
    font-family: var(--font-head);
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: var(--s-3) var(--s-4);
  }
  .modal-body {
    padding: var(--s-5) var(--s-4);
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1.5;
    color: var(--fg);
  }
  .modal-body p { margin: 0; }
  .modal-actions {
    display: flex;
    gap: var(--s-3);
    justify-content: flex-end;
    padding: 0 var(--s-4) var(--s-4);
  }
  .modal-actions .btn {
    min-height: var(--tap-min);
    padding: var(--s-3) var(--s-5);
  }
</style>
