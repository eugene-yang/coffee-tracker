<script lang="ts">
  // Station: one person's rating of a cup, their name large so the right person rates. Each star tap
  // is a new rating; their last one is shown with Edit. Closes 1.5 s after a star.
  import { onDestroy } from 'svelte'
  import Avatar from './Avatar.svelte'
  import Stars from './Stars.svelte'
  import TempChip from './TempChip.svelte'
  import TempIcon from './TempIcon.svelte'
  import { brewerLabel } from '../lib/domain/brew'
  import { latestTastings, minutesSince, overallLabel } from '../lib/domain/tasting'
  import type { Brew } from '../lib/domain/types'
  import { inventory } from '../lib/state/inventory.svelte'
  import { brewers, tastings, users } from '../lib/state/live.svelte'
  import { navigate } from '../lib/state/router.svelte'
  import { timeAgo } from '../lib/state/shortcuts.svelte'
  import { rateLink, ratedToast, tastingState } from '../lib/state/tastings.svelte'

  let { brew, userId, onclose }: { brew: Brew; userId: string; onclose: () => void } = $props()

  const user = $derived(users.get(userId))
  const title = $derived(inventory.byId.get(brew.bag_id)?.title ?? 'Bag')
  const last = $derived(latestTastings(tastings.rows).get(`${brew.id}:${userId}`))

  let closing: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(closing))

  async function rate(n: number) {
    const { undo } = await tastingState.rate(brew, userId, n)
    ratedToast(user?.name ?? '', n, undo)
    clearTimeout(closing)
    closing = setTimeout(onclose, 1500)
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="sheet" role="dialog" aria-modal="true" aria-label="{user?.name}'s rating" tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <div class="who">
      <Avatar {user} size={64} />
      <span class="name">{user?.name ?? '?'}</span>
      <button class="close" aria-label="Close" onclick={onclose}>✕</button>
    </div>
    <p class="muted">{title} · {brewerLabel(brew, brewers.rows)}</p>
    {#if last}
      <p class="last">
        Last: <span class="lit">{'★'.repeat(last.overall ?? 0)}</span>
        {overallLabel(last.overall)} · <TempIcon band={last.temp_band} word /> · {timeAgo(last.rated_at, tastingState.now)}
        <button class="edit" onclick={() => navigate(rateLink(brew.id, userId, last.id))}>Edit</button>
      </p>
    {/if}
    <div class="row">
      <TempChip band={tastingState.bandFor(brew, userId)} minutes={minutesSince(brew.brewed_at, tastingState.now)} oncycle={() => tastingState.cycle(brew, userId)} />
    </div>
    <Stars value={null} size={72} label="{user?.name}'s stars" onrate={rate} />
    <button class="detail" onclick={() => navigate(rateLink(brew.id, userId))}>More detail</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0 0 calc(0px - var(--viewport-gap));
    z-index: 15;
    background: rgb(0 0 0 / 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sheet {
    width: min(520px, calc(100vw - 32px));
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px 24px 24px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .name {
    flex: 1;
    font-size: 32px;
    font-weight: 700;
  }
  .close {
    width: 56px;
    min-height: 56px;
    padding: 0;
    border: none;
    background: transparent;
  }
  p {
    margin: 0;
  }
  .detail {
    min-height: 56px;
  }
  .last {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .lit {
    color: var(--accent);
  }
  .edit {
    min-height: 56px;
    margin-left: auto;
  }
</style>
