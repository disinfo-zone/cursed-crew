/**
 * Minimal debounced dispatcher. Use for text-field edits that should eventually
 * fire a mutation without flooding the server on every keystroke.
 *
 * const ship = useDebouncedField(current, (next) => dispatch(...), 400);
 * <input bind:value={ship.draft} oninput={ship.onInput} onblur={ship.flush}/>
 */

export type DebouncedField<T> = {
  /** Local draft value — bind your input to this. */
  draft: T;
  /** Call on input events. Schedules a commit after `delay` ms. */
  onInput: () => void;
  /** Call on blur / Enter to commit immediately. */
  flush: () => void;
  /** Call on mount to reset draft from the latest remote value. */
  reset: (incoming: T) => void;
};

export function useDebouncedField<T>(
  initial: T,
  commit: (value: T) => void,
  delay = 400
): DebouncedField<T> {
  // We deliberately expose reactive state via a Svelte rune call. This file
  // has the .svelte.ts extension so runes are enabled.
  let draft = $state<T>(initial);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function onInput() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      commit(draft);
    }, delay);
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    commit(draft);
  }

  function reset(incoming: T) {
    if (timer) {
      // A pending commit would overwrite the incoming server value; drop it.
      clearTimeout(timer);
      timer = null;
    }
    draft = incoming;
  }

  return {
    get draft() {
      return draft;
    },
    set draft(v: T) {
      draft = v;
    },
    onInput,
    flush,
    reset
  };
}
