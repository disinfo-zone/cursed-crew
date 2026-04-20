<script lang="ts">
  import '$design/tokens.css';
  import '$design/type.css';
  import '$design/components.css';
  import '../app.css';

  let { children } = $props();
</script>

{@render children()}
