<script lang="ts">
  // A brewer's illustration (drawn per brewer, see lib/illustrations/STYLE.md) or its method icon
  import MethodIcon from './MethodIcon.svelte'
  import { illustration } from '../lib/illustrations'

  let { illustrationKey, method, size = 64 }: { illustrationKey: string | null | undefined; method: string | null | undefined; size?: number } =
    $props()

  const ill = $derived(illustration(illustrationKey))
</script>

{#if ill}
  <span class="ill" style:width="{size}px" style:height="{size}px" style:--ill-accent={ill.accent} role="img" aria-label={ill.name}
    >{@html ill.svg}</span
  >
{:else}
  <span class="fallback" style:width="{size}px" style:height="{size}px"><MethodIcon {method} size={Math.round(size * 0.55)} /></span>
{/if}

<style>
  .ill,
  .fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .fallback {
    color: var(--text-muted);
  }
  .ill :global(svg) {
    width: 100%;
    height: 100%;
  }
  .ill {
    --ill-line: #2b2622;
    --ill-body: #ebe5dd;
    --ill-dark: #3d3935;
    --ill-shadow: rgb(0 0 0 / 0.12);
    --ill-glass: rgb(200 222 235 / 0.5);
  }
  :global(.station) .ill,
  :global([data-theme='dark']) .ill {
    --ill-line: #ece6df;
    --ill-body: #4a4540;
    --ill-dark: #6e6760;
    --ill-shadow: rgb(0 0 0 / 0.45);
    --ill-glass: rgb(200 222 235 / 0.28);
  }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .ill {
      --ill-line: #ece6df;
      --ill-body: #4a4540;
      --ill-dark: #6e6760;
      --ill-shadow: rgb(0 0 0 / 0.45);
      --ill-glass: rgb(200 222 235 / 0.28);
    }
  }
  .ill :global(.sh) {
    fill: var(--ill-shadow);
  }
  .ill :global(.b) {
    fill: var(--ill-body);
  }
  .ill :global(.d) {
    fill: var(--ill-dark);
  }
  .ill :global(.a) {
    fill: var(--ill-accent);
  }
  .ill :global(.g) {
    fill: var(--ill-accent);
    fill-opacity: 0.45;
  }
  .ill :global(.gl) {
    fill: var(--ill-glass);
  }
  .ill :global(.in) {
    fill: var(--ill-line);
    fill-opacity: 0.22;
  }
  .ill :global(.h) {
    fill: #fff;
    fill-opacity: 0.55;
    stroke: none;
  }
  .ill :global(.fl) {
    fill: #f2a33a;
  }
  .ill :global(.s) {
    fill: none;
    stroke: var(--ill-line);
    stroke-width: 5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .ill :global(.s.thin) {
    stroke-width: 3;
    opacity: 0.6;
  }
</style>
