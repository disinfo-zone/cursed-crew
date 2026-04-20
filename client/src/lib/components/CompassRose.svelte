<script lang="ts">
  type Props = { size?: number; label?: string };
  let { size = 24, label = 'Loading' }: Props = $props();
</script>

<span class="compass" role="status" aria-label={label} style="--cc-compass-size: {size}px">
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="32" cy="32" r="26" />
    <circle cx="32" cy="32" r="20" stroke-dasharray="2 3" />
    <path d="M32 6 L35 30 L32 34 L29 30 Z" fill="currentColor" />
    <path d="M32 58 L29 34 L32 30 L35 34 Z" />
    <circle cx="32" cy="32" r="2.5" fill="currentColor" />
    <path d="M4 32 L10 32 M54 32 L60 32 M32 4 L32 10 M32 54 L32 60" />
  </svg>
  <span class="visually-hidden">{label}</span>
</span>

<style>
  .compass {
    display: inline-flex;
    width: var(--cc-compass-size);
    height: var(--cc-compass-size);
    color: currentColor;
  }
  svg {
    width: 100%;
    height: 100%;
    animation: compass-spin 3s linear infinite;
    transform-origin: 50% 50%;
  }
  @keyframes compass-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    svg { animation: none; }
  }
</style>
