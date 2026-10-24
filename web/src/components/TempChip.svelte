<script lang="ts">
  // "Warm · 14 min": preselected from minutes since brewing, a tap cycles Hot → Warm → Cool by feel
  import { TEMP_BAND_LABELS } from '../lib/domain/tasting'
  import type { TempBand } from '../lib/domain/tempBand'

  let {
    band,
    minutes,
    now = false,
    compact = false,
    oncycle,
  }: { band: TempBand; minutes: number; now?: boolean; compact?: boolean; oncycle: () => void } = $props()
</script>

<button class="temp {band}" title="Cup temperature — tap to change" onclick={oncycle}
  >{TEMP_BAND_LABELS[band]}{now ? ' now' : ''} · {Math.round(minutes)}{compact ? 'm' : ' min'}</button
>

<style>
  .temp {
    flex: none;
    white-space: nowrap;
    border-radius: 999px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .hot {
    color: var(--danger);
  }
  .warm {
    color: var(--warn);
  }
  .cool {
    color: var(--text-muted);
  }
</style>
