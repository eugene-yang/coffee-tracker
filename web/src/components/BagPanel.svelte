<script lang="ts">
  // Station: bag details beside the grid (tap a tile), big Brew again on top, the last few brews below
  import BagActions from './BagActions.svelte'
  import BagHistory from './BagHistory.svelte'
  import FreshnessBar from './FreshnessBar.svelte'
  import Photo from './Photo.svelte'
  import type { BagView } from '../lib/domain/inventory'
  import { inventory } from '../lib/state/inventory.svelte'
  import { brewAgainSource, brewerLabel, paramSummary, paramsOf } from '../lib/domain/brew'
  import { brewState } from '../lib/state/brew.svelte'
  import { device } from '../lib/state/device.svelte'
  import { brewers, brews } from '../lib/state/live.svelte'
  import { navigate } from '../lib/state/router.svelte'

  let { view, onclose }: { view: BagView; onclose: () => void } = $props()

  const again = $derived(brewAgainSource(brews.rows, view.id, device.userId))

  function brew() {
    brewState.prepare(view.id, device.userId, again ? { brewerId: again.brewer_id, method: again.method } : {})
    navigate(`/brew/${view.id}`)
  }
</script>

<aside class="panel" aria-label="Bag details">
  <div class="head">
    <span class="thumb"><Photo id={view.photoIds[0]} /></span>
    <div class="titles">
      {#if view.roasterName}<span class="roaster">{view.roasterName}</span>{/if}
      <strong>{view.title}</strong>
      {#if view.subtitle}<span class="muted">{view.subtitle}</span>{/if}
    </div>
    <button class="close" aria-label="Close" onclick={onclose}>✕</button>
  </div>

  <FreshnessBar {view} rest={inventory.rest} />

  <button class="primary brew" onclick={brew}>
    {again ? 'Brew again' : 'Brew'}
    {#if again}<small>{brewerLabel(again, brewers.rows)} · {paramSummary(paramsOf(again))}</small>{/if}
  </button>

  {#if view.gramsLeft != null}
    <p class="amount">{view.lastCup ? 'Last cup' : `~${view.cupsLeft} cups`} · {Math.round(view.gramsLeft)} g left</p>
  {/if}
  <BagActions {view} />

  {#if view.needsReview}
    <p class="muted">Label details still need a review on the phone.</p>
  {/if}
  <BagHistory bagId={view.id} limit={3} filter={false} />
</aside>

<style>
  .panel {
    position: sticky;
    top: 8px;
    width: 360px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    max-height: calc(100dvh - 80px);
    overflow-y: auto;
  }
  .head {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .thumb {
    width: 72px;
    height: 72px;
    border-radius: 8px;
    overflow: hidden;
    flex: none;
  }
  .titles {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .roaster {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .close {
    width: 56px;
    min-height: 56px;
    padding: 0;
    border: none;
    background: transparent;
  }
  .brew {
    min-height: 72px;
    font-size: 20px;
    font-weight: 700;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }
  .brew small {
    font-size: 14px;
    font-weight: 500;
  }
  .amount {
    margin: 0;
    font-weight: 600;
  }
</style>
