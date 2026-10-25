<script lang="ts">
  // Every rating, newest first: mine by default; one row of dropdowns narrows by who rated, who
  // brewed and the brewer / grinder used. A rating opens its detail (to edit); the bag name opens
  // the bag with its whole history.
  import Avatar from '../components/Avatar.svelte'
  import TempIcon from '../components/TempIcon.svelte'
  import { brewerLabel, paramSummary, paramsOf } from '../lib/domain/brew'
  import { brewMatches, overallLabel } from '../lib/domain/tasting'
  import { device } from '../lib/state/device.svelte'
  import { inventory } from '../lib/state/inventory.svelte'
  import { brewers, brews, grinders, tastings, users } from '../lib/state/live.svelte'
  import { href } from '../lib/state/router.svelte'
  import { dateTime } from '../lib/state/shortcuts.svelte'
  import { clearRatingFilter, rateLink, ratingFilter, ratingMatches } from '../lib/state/tastings.svelte'

  const PAGE = 50
  let shown = $state(PAGE)

  const me = $derived(users.get(device.userId))
  // Nobody on this device yet: "me" has nothing to show
  $effect(() => {
    if (users.loaded && ratingFilter.who === 'mine' && !me) ratingFilter.who = 'everyone'
  })
  const others = $derived(users.rows.filter((u) => u.id !== device.userId))
  const filtered = $derived(
    ratingFilter.who !== (me ? 'mine' : 'everyone') || ratingFilter.brewedBy !== 'any' || ratingFilter.brewer !== 'any' || ratingFilter.grinder !== 'any',
  )

  const list = $derived(
    tastings.rows
      .filter((t) => {
        const b = brews.get(t.brew_id)
        return b && ratingMatches(t, ratingFilter.who, device.userId) && brewMatches(b, ratingFilter, brewers.rows)
      })
      .sort((a, b) => b.rated_at.localeCompare(a.rated_at)),
  )
</script>

<div class="stack">
  <div class="filters" role="group" aria-label="Filters">
    <select class:on={ratingFilter.who !== 'mine'} bind:value={ratingFilter.who} aria-label="Rated by">
      {#if me}<option value="mine">Rated: Me</option>{/if}
      <option value="everyone">Rated: All</option>
      {#each others as u (u.id)}<option value={u.id}>Rated: {u.name}</option>{/each}
    </select>
    <select class:on={ratingFilter.brewedBy !== 'any'} bind:value={ratingFilter.brewedBy} aria-label="Brewed by">
      <option value="any">Brewed: Anyone</option>
      {#each users.rows as u (u.id)}<option value={u.id}>Brewed: {u.id === device.userId ? 'Me' : u.name}</option>{/each}
    </select>
    <select class:on={ratingFilter.brewer !== 'any'} bind:value={ratingFilter.brewer} aria-label="Brewer">
      <option value="any">Brewer: Any</option>
      {#each brewers.rows as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
    </select>
    <select class:on={ratingFilter.grinder !== 'any'} bind:value={ratingFilter.grinder} aria-label="Grinder">
      <option value="any">Grinder: Any</option>
      {#each grinders.rows as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
    </select>
  </div>
  {#if filtered}
    <p class="count muted">
      {list.length} rating{list.length === 1 ? '' : 's'} · <button class="clear" onclick={clearRatingFilter}>Clear</button>
    </p>
  {/if}

  {#each list.slice(0, shown) as t (t.id)}
    {@const brew = brews.get(t.brew_id)!}
    {@const view = inventory.byId.get(brew.bag_id)}
    <div class="entry">
      <a class="bag" href={href(`/bag/${brew.bag_id}`)}>{view?.title ?? 'Bag'}</a>
      <a class="rating" href={href(rateLink(brew.id, t.taster_id, t.id))} aria-label="{users.get(t.taster_id)?.name}'s rating of {view?.title}">
        {#if ratingFilter.who !== 'mine'}<Avatar user={users.get(t.taster_id)} size={28} />{/if}
        <span class="text">
          <span><span class="lit">{'★'.repeat(t.overall ?? 0)}</span> {overallLabel(t.overall)} <TempIcon band={t.temp_band} /></span>
          <span class="muted">{brewerLabel(brew, brewers.rows)} · {paramSummary(paramsOf(brew))}</span>
        </span>
        <span class="muted when">{dateTime(t.rated_at)}</span>
      </a>
    </div>
  {:else}
    <p class="muted">{filtered ? 'No ratings match these filters.' : ratingFilter.who === 'mine' ? 'Your ratings show up here.' : 'No ratings yet.'}</p>
  {/each}
  {#if list.length > shown}
    <button onclick={() => (shown += PAGE)}>Show more</button>
  {/if}
</div>

<style>
  /* An even 2 × 2 on a phone (one row when there's room), so a filter that's set is never off-screen */
  .filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
  }
  .filters select {
    min-width: 0;
    width: 100%;
    min-height: 40px;
    padding: 0 28px 0 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface)
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%23888' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")
      no-repeat right 10px center;
    appearance: none;
    -webkit-appearance: none;
    font-size: 16px; /* smaller makes iOS zoom in on tap */
    text-overflow: ellipsis;
  }
  .filters select.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .count {
    margin: 0;
    font-size: 14px;
  }
  .clear {
    min-height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    font-weight: 600;
  }
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
