<script lang="ts">
  // "Warm · 14 min": suggested from minutes since brewing (Settings), a tap cycles Hot → Warm → Cool by feel
  import TempIcon from './TempIcon.svelte'
  import type { TempBand } from '../lib/domain/tempBand'

  let {
    band,
    minutes,
    compact = false,
    oncycle,
  }: { band: TempBand; minutes: number; compact?: boolean; oncycle: () => void } = $props()
</script>

<button class="temp {band}" title="Cup temperature — tap to change" onclick={oncycle}
  ><TempIcon {band} word /> · {Math.round(minutes)}{compact ? 'm' : ' min'}</button
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
