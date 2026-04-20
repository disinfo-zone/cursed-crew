<script lang="ts">
  /**
   * Integer stepper. No container border, no dividers — the +/- glyphs are
   * the entire visual language. Arrow keys also adjust when focus is on a
   * button. Set `fastStep` to add outer ±N buttons (used for silver and
   * doubloons where ±1 is tedious).
   */
  type Props = {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    fastStep?: number;
    label: string;
    onChange: (next: number) => void;
    disabled?: boolean;
    compact?: boolean;
  };

  let {
    value,
    min = Number.NEGATIVE_INFINITY,
    max = Number.POSITIVE_INFINITY,
    step = 1,
    fastStep = 0,
    label,
    onChange,
    disabled = false,
    compact = false
  }: Props = $props();

  function bump(delta: number) {
    if (disabled) return;
    const next = clamp(value + delta);
    if (next !== value) onChange(next);
  }

  function clamp(n: number): number {
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function onButtonKey(e: KeyboardEvent) {
    if (disabled) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      bump(step);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      bump(-step);
    }
  }
</script>

<div class="stepper" class:compact aria-label={label} role="group">
  {#if fastStep > 0}
    <button
      type="button"
      class="step-btn fast"
      aria-label="{label}: subtract {fastStep}"
      onclick={() => bump(-fastStep)}
      onkeydown={onButtonKey}
      disabled={disabled || value <= min}
    >−{fastStep}</button>
  {/if}
  <button
    type="button"
    class="step-btn"
    aria-label="{label}: decrease"
    onclick={() => bump(-step)}
    onkeydown={onButtonKey}
    disabled={disabled || value <= min}
  >−</button>
  <span class="stepper-value stat" aria-live="polite">{value}</span>
  <button
    type="button"
    class="step-btn"
    aria-label="{label}: increase"
    onclick={() => bump(step)}
    onkeydown={onButtonKey}
    disabled={disabled || value >= max}
  >+</button>
  {#if fastStep > 0}
    <button
      type="button"
      class="step-btn fast"
      aria-label="{label}: add {fastStep}"
      onclick={() => bump(fastStep)}
      onkeydown={onButtonKey}
      disabled={disabled || value >= max}
    >+{fastStep}</button>
  {/if}
</div>

<style>
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
  }
  .step-btn {
    width: var(--tap-min);
    min-width: var(--tap-min);
    min-height: var(--tap-min);
    background: transparent;
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: 1.5rem;
    line-height: 1;
    border: 0;
    padding: 0;
    cursor: pointer;
    border-radius: 0;
  }
  .step-btn:hover:not([disabled]) {
    background: var(--bg-dim);
    color: var(--fg);
  }
  .step-btn:focus-visible {
    outline: var(--ring) solid var(--accent-bright);
    outline-offset: -2px;
    color: var(--fg);
  }
  .step-btn[disabled] {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .step-btn.fast {
    font-size: 0.85rem;
    width: auto;
    padding: 0 var(--s-2);
    letter-spacing: 0.04em;
    color: var(--fg-mute);
  }
  .stepper-value {
    min-width: 2.5ch;
    padding: 0 var(--s-2);
    font-family: var(--font-mono);
    font-size: 1.5rem;
    line-height: 1;
    text-align: center;
    color: var(--fg);
  }
  .stepper.compact .step-btn { width: 40px; min-width: 40px; min-height: 40px; font-size: 1.25rem; }
  .stepper.compact .step-btn.fast { font-size: 0.72rem; padding: 0 var(--s-2); }
  .stepper.compact .stepper-value { font-size: 1.15rem; padding: 0 var(--s-2); min-width: 2.5ch; }
</style>
