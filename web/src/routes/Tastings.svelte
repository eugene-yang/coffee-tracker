<script lang="ts">
  // Every rating, newest first: mine by default, everyone's or one person's on request.
  // A rating opens its detail (to edit); the bag name opens the bag with its whole history.
  import Avatar from '../components/Avatar.svelte'
  import WhoFilter from '../components/WhoFilter.svelte'
  import { brewerLabel, paramSummary, paramsOf } from '../lib/domain/brew'
  import { TEMP_BAND_LABELS, overallLabel } from '../lib/domain/tasting'
  import { device } from '../lib/state/device.svelte'
  import { inventory } from '../lib/state/inventory.svelte'
  import { brewers, brews, tastings, users } from '../lib/state/live.svelte'
  import { href } from '../lib/state/router.svelte'
  import { dateTime } from '../lib/state/shortcuts.svelte'
  import { rateLink, ratingFilter, ratingMatches } from '../lib/state/tastings.svelte'

  const PAGE = 50
  let shown = $state(PAGE)

  const list = $derived(
    tastings.rows
      .filter((t) => brews.get(t.brew_id) && ratingMatches(t, ratingFilter.who, device.userId))
      .sort((a, b) => b.rated_at.localeCompare(a.rated_at)),
  )
</script>

<div class="stack">
  <WhoFilter />

  {#each list.slice(0, shown) as t (t.id)}
    {@const brew = brews.get(t.brew_id)!}
    {@const view = inventory.byId.get(brew.bag_id)}
    <div class="entry">
      <a class="bag" href={href(`/bag/${brew.bag_id}`)}>{view?.title ?? 'Bag'}</a>
      <a class="rating" href={href(rateLink(brew.id, t.taster_id, t.id))} aria-label="{users.get(t.taster_id)?.name}'s rating of {view?.title}">
        {#if ratingFilter.who === 'everyone'}<Avatar user={users.get(t.taster_id)} size={28} />{/if}
        <span class="text">
          <span><span class="lit">{'★'.repeat(t.overall ?? 0)}</span> {overallLabel(t.overall)} · {TEMP_BAND_LABELS[t.temp_band ?? 'hot']}</span>
          <span class="muted">{brewerLabel(brew, brewers.rows)} · {paramSummary(paramsOf(brew))}</span>
        </span>
        <span class="muted when">{dateTime(t.rated_at)}</span>
      </a>
    </div>
  {:else}
    <p class="muted">{ratingFilter.who === 'mine' ? 'Your ratings show up here.' : 'No ratings yet.'}</p>
  {/each}
  {#if list.length > shown}
    <button onclick={() => (shown += PAGE)}>Show more</button>
  {/if}
</div>

<style>
  .entry {
    display: flex;
    flex-direction: column;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }
  .bag {
    align-self: flex-start;
    color: var(--text);
    font-weight: 700;
    text-decoration: none;
    min-height: 32px;
    display: inline-flex;
    align-items: center;
  }
  .rating {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
    text-decoration: none;
    min-height: 44px;
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .text .muted,
  .when {
    font-size: 14px;
  }
  .when {
    flex: none;
  }
  .lit {
    color: var(--accent);
  }
  p {
    margin: 0;
  }
</style>
