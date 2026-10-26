<script lang="ts">
  // Phone Home: one recent cup. One tap on a star rates it, no navigation. Once rated, the latest
  // rating shows with Edit (change it) and Rate again (a new rating, e.g. as it cools).
  import MethodIcon from './MethodIcon.svelte'
  import Stars from './Stars.svelte'
  import TempChip from './TempChip.svelte'
  import TempIcon from './TempIcon.svelte'
  import { brewerLabel } from '../lib/domain/brew'
  import { overallLabel, type PendingTasting } from '../lib/domain/tasting'
  import { inventory } from '../lib/state/inventory.svelte'
  import { brewers, users } from '../lib/state/live.svelte'
  import { href } from '../lib/state/router.svelte'
  import { timeAgo } from '../lib/state/shortcuts.svelte'
  import { dismissCups, rateLink, ratedToast, tastingState } from '../lib/state/tastings.svelte'

  let { p }: { p: PendingTasting } = $props()

  const title = $derived(inventory.byId.get(p.brew.bag_id)?.title ?? 'Bag')
  const brewer = $derived(p.brew.brewer_user_id !== p.userId ? users.get(p.brew.brewer_user_id)?.name : null)
  let again = $state(false)
  const showStars = $derived(p.state === 'new' || again)

  async function rate(n: number) {
    const { undo } = await tastingState.rate(p.brew, p.userId, n)
    again = false
    ratedToast('', n, undo)
  }
</script>

<article class="card pending" class:rated={!showStars} aria-label="Cup: {title}">
  <div class="head">
    <MethodIcon method={p.brew.method} size={22} />
    <span class="title">
      <strong>{title}</strong>
      <span class="muted">{brewerLabel(p.brew, brewers.rows)}{brewer ? ` · brewed by ${brewer}` : ''}</span>
    </span>
    {#if showStars}
      <TempChip band={tastingState.bandFor(p.brew, p.userId)} minutes={p.minutes} oncycle={() => tastingState.cycle(p.brew, p.userId)} />
    {/if}
    <button class="dismiss" aria-label="Dismiss {title}: not drinking it" onclick={() => dismissCups([p.brew.id], p.userId)}>✕</button>
  </div>

  {#if showStars}
    <Stars value={null} label="Rate {title}" showLabel={false} onrate={rate} />
    <div class="foot">
      {#if again}<button class="link" onclick={() => (again = false)}>Cancel</button>{:else}<span></span>{/if}
      <a href={href(rateLink(p.brew.id, p.userId))}>More detail ›</a>
    </div>
  {:else if p.last}
    <p class="last">
      <span class="lit">{'★'.repeat(p.last.overall ?? 0)}</span>
      {overallLabel(p.last.overall)} · <TempIcon band={p.last.temp_band} word /> · {timeAgo(p.last.rated_at, tastingState.now)}{p.count > 1
        ? ` · ${p.count} ratings`
        : ''}
    </p>
    <div class="foot">
      <a href={href(rateLink(p.brew.id, p.userId, p.last.id))}>Edit</a>
      <button class="again" onclick={() => (again = true)}>Rate again</button>
    </div>
  {/if}
</article>

<style>
  .pending {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pending.rated {
    background: transparent;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .dismiss {
    flex: none;
    width: 40px;
    min-height: 40px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 18px;
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
  .again {
    min-height: 40px;
    font-weight: 600;
  }
  .link {
    border: none;
    background: transparent;
    color: var(--text-muted);
    min-height: 40px;
    padding: 0;
  }
</style>
