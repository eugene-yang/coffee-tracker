<script lang="ts">
  // One bag in the inventory: a grid tile on the station, a list row on the phone
  import FreshnessBar from './FreshnessBar.svelte'
  import Photo from './Photo.svelte'
  import type { BagView, RestWindow } from '../lib/domain/inventory'
  import type { SearchHit } from '../lib/domain/search'

  let {
    view,
    rest,
    layout,
    why = null,
    selected = false,
    onselect,
  }: {
    view: BagView
    rest: RestWindow
    layout: 'phone' | 'station'
    why?: SearchHit['why']
    selected?: boolean
    onselect: (id: string) => void
  } = $props()

  const WHY_LABELS: Record<string, string> = { producer: 'producer', variety: 'variety', flavor: 'notes', notes: 'notes' }
  const amount = $derived(
    view.gramsLeft == null ? null : view.lastCup ? 'Last cup' : view.cupsLeft === 1 ? '~1 cup' : `~${view.cupsLeft} cups`,
  )
</script>

<button class="bag {layout}" class:selected class:finished={view.state === 'finished'} onclick={() => onselect(view.id)}>
  <span class="thumb"><Photo id={view.photoIds[0]} alt="" /></span>
  <span class="info">
    {#if view.roasterName}<span class="roaster">{view.roasterName}</span>{/if}
    <span class="name">{view.title}</span>
    {#if view.subtitle}<span class="sub">{view.subtitle}</span>{/if}
    {#if why}<span class="why">{WHY_LABELS[why.field] ?? why.field}: {why.text}</span>{/if}
    <FreshnessBar {view} {rest} />
    {#if amount}
      <span class="amount" class:low={view.lastCup}
        >{amount}{#if view.gramsLeft != null}<small> · {Math.round(view.gramsLeft)} g</small>{/if}</span
      >
    {/if}
  </span>
</button>

<style>
  .bag {
    display: flex;
    gap: 12px;
    width: 100%;
    padding: 0;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    content-visibility: auto;
  }
  .bag.selected {
    border-color: var(--accent);
  }
  .bag.finished {
    opacity: 0.55;
  }
  .phone {
    align-items: center;
    min-height: 80px;
    padding: 8px;
    contain-intrinsic-size: auto 96px;
  }
  .phone .thumb {
    width: 64px;
    height: 64px;
    border-radius: 8px;
    overflow: hidden;
    flex: none;
  }
  .station {
    flex-direction: column;
    gap: 0;
    contain-intrinsic-size: auto 250px;
  }
  /* Short crop so two rows fit on a 600px-tall tablet */
  .station .thumb {
    height: 112px;
    width: 100%;
    overflow: hidden;
  }
  .station .info {
    padding: 8px 12px 10px;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }
  .roaster {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .name {
    font-size: 17px;
    font-weight: 600;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .sub,
  .why {
    font-size: 14px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .why {
    color: var(--accent);
  }
  .amount {
    font-size: 14px;
    font-weight: 600;
  }
  .amount small {
    font-weight: 400;
    color: var(--text-muted);
  }
  .amount.low {
    color: var(--warn);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 13px;
  }
</style>
