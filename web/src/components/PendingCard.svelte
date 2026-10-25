<script lang="ts">
  // Phone Home: one cup waiting for a rating. One tap on a star rates it; no navigation.
  import MethodIcon from './MethodIcon.svelte'
  import Stars from './Stars.svelte'
  import TempChip from './TempChip.svelte'
  import { brewerLabel } from '../lib/domain/brew'
  import { TEMP_BAND_LABELS, overallLabel, type PendingTasting } from '../lib/domain/tasting'
  import { inventory } from '../lib/state/inventory.svelte'
  import { brewers, users } from '../lib/state/live.svelte'
  import { href } from '../lib/state/router.svelte'
  import { rateLink, tastingState } from '../lib/state/tastings.svelte'

  let { p }: { p: PendingTasting } = $props()

  const title = $derived(inventory.byId.get(p.brew.bag_id)?.title ?? 'Bag')
  const brewer = $derived(p.brew.brewer_user_id !== p.userId ? users.get(p.brew.brewer_user_id)?.name : null)
</script>

<article class="card pending" class:muted={p.state === 'waiting'} aria-label="Cup: {title}">
  <div class="head">
    <MethodIcon method={p.brew.method} size={22} />
    <span class="title">
      <strong>{title}</strong>
      <span class="muted">{brewerLabel(p.brew, brewers.rows)}{brewer ? ` · brewed by ${brewer}` : ''}</span>
    </span>
    {#if p.state !== 'waiting'}
      <TempChip band={tastingState.bandOf(p)} minutes={p.minutes} now={p.state === 'again'} oncycle={() => tastingState.cycleBand(p)} />
    {/if}
  </div>

  {#if p.state === 'waiting' && p.last}
    <p class="last">
      <span class="lit">{'★'.repeat(p.last.overall ?? 0)}</span>
      {overallLabel(p.last.overall)} · {TEMP_BAND_LABELS[p.last.temp_band ?? 'hot']}
    </p>
    <div class="foot">
      <span class="muted">Rate again when {TEMP_BAND_LABELS[p.nextBand ?? 'warm']}</span>
      <a href={href(rateLink(p))}>More detail ›</a>
    </div>
  {:else}
    <Stars value={p.state === 'editing' ? p.last?.overall : null} label="Rate {title}" showLabel={false} onrate={(n) => tastingState.rate(p, n)} />
    <div class="foot">
      <strong>{p.state === 'editing' ? overallLabel(p.last?.overall) : ''}</strong>
      <a href={href(rateLink(p))}>More detail ›</a>
    </div>
  {/if}
</article>

<style>
  .pending {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pending.muted {
    background: transparent;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title > * {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .title .muted {
    font-size: 14px;
  }
  .last {
    margin: 0;
  }
  .lit {
    color: var(--accent);
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .foot a {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
  }
</style>
