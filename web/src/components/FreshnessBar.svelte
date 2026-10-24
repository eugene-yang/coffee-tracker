<script lang="ts">
  import type { BagView, RestWindow } from '../lib/domain/inventory'

  let { view, rest }: { view: BagView; rest: RestWindow } = $props()

  // Bar spans 0 … 1.4 × peak end; zones resting → peak → fading, tick marks today
  const span = $derived(rest.peak_days * 1.4)
  const pct = (d: number) => `${Math.min(100, Math.max(0, (d / span) * 100))}%`
  const label = $derived(
    view.state === 'frozen'
      ? `❄ Frozen ${view.frozenDays ?? 0}d`
      : view.ageDays == null
        ? 'No roast date'
        : view.freshness === 'resting'
          ? `Resting · ready in ${view.readyInDays}d`
          : `Day ${view.ageDays}${view.freshness === 'fading' ? ' · fading' : ''}`,
  )
</script>

<div class="fresh {view.freshness ?? 'none'}" class:frozen={view.state === 'frozen'}>
  {#if view.ageDays != null && view.state !== 'frozen'}
    <div class="bar" aria-hidden="true">
      <span class="zone resting" style:width={pct(rest.rest_days)}></span>
      <span class="zone peak" style:width={`calc(${pct(rest.peak_days)} - ${pct(rest.rest_days)})`}></span>
      <span class="zone fading"></span>
      <span class="tick" style:left={pct(view.ageDays)}></span>
    </div>
  {/if}
  <span class="label">{label}</span>
</div>

<style>
  .fresh {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .bar {
    position: relative;
    display: flex;
    height: 4px;
    border-radius: 2px;
    overflow: visible;
  }
  .zone {
    height: 100%;
  }
  .zone.resting {
    background: #7f8ea3;
  }
  .zone.peak {
    background: var(--ok);
  }
  .zone.fading {
    flex: 1;
    background: var(--warn);
  }
  .tick {
    position: absolute;
    top: -3px;
    width: 2px;
    height: 10px;
    background: var(--text);
    transform: translateX(-1px);
  }
  .peak .label {
    color: var(--text);
  }
</style>
