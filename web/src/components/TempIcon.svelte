<script lang="ts">
  // Hot / Warm / Cool as a steaming cup; the word is shown where a cup is being rated, and is
  // always the accessible name (and tooltip) where only the icon is
  import { tempIconSvg } from '../lib/icons'
  import { TEMP_BAND_LABELS } from '../lib/domain/tasting'
  import type { TempBand } from '../lib/domain/tempBand'

  let { band, size = 18, word = false }: { band: TempBand | null | undefined; size?: number; word?: boolean } = $props()
  const b = $derived(band ?? 'hot')
</script>

{#if word}
  <span class="temp {b}"><span class="icon">{@html tempIconSvg(b, size)}</span>{TEMP_BAND_LABELS[b]}</span>
{:else}
  <span class="temp {b}" role="img" aria-label={TEMP_BAND_LABELS[b]} title={TEMP_BAND_LABELS[b]}><span class="icon">{@html tempIconSvg(b, size)}</span></span>
{/if}

<style>
  .temp {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    vertical-align: -0.2em;
  }
  .icon {
    display: inline-flex;
    flex: none;
  }
  .hot .icon {
    color: var(--danger);
  }
  .warm .icon {
    color: var(--warn);
  }
  .cool .icon {
    color: var(--text-muted);
  }
</style>
