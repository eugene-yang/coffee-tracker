<script lang="ts">
  // Overall rating: five big star buttons, the word for the selected one underneath
  import { OVERALL_LABELS, overallLabel } from '../lib/domain/tasting'

  let {
    value,
    size = 64,
    label = 'Overall',
    showLabel = true,
    onrate,
  }: {
    value: number | null | undefined
    size?: number
    label?: string
    showLabel?: boolean
    onrate: (n: number) => void
  } = $props()

  // Wet hands: a second tap within 300 ms is a bounce, not a new rating
  let lastTap = 0
  function tap(n: number) {
    const t = Date.now()
    if (t - lastTap < 300) return
    lastTap = t
    onrate(n)
  }
</script>

<div class="rating">
  <div class="stars" role="radiogroup" aria-label={label}>
    {#each OVERALL_LABELS as word, i (i)}
      {@const n = i + 1}
      <button
        role="radio"
        aria-checked={value === n}
        aria-label="{n} star{n > 1 ? 's' : ''}: {word}"
        class:lit={!!value && n <= value}
        style:width="{size}px"
        style:height="{size}px"
        style:font-size="{Math.round(size * 0.62)}px"
        onclick={() => tap(n)}>{value && n <= value ? '★' : '☆'}</button
      >
    {/each}
  </div>
  {#if showLabel}<div class="word" aria-live="polite">{overallLabel(value)}</div>{/if}
</div>

<style>
  .rating {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .stars {
    display: flex;
    gap: 2px;
  }
  button {
    flex: 0 1 auto;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    line-height: 1;
  }
  button.lit {
    color: var(--accent);
  }
  .word {
    min-height: 1.4em;
    font-weight: 600;
  }
</style>
