<script lang="ts">
  // One brew, after the fact: what it was made with (recipe, equipment, settings), the laps clicked
  // while timing it, and every rating of the cup. Anyone can rate it from here at any time — a cup
  // dismissed from Home (or long gone from it) is never out of reach. /brews/:id
  import Avatar from '../components/Avatar.svelte'
  import Stars from '../components/Stars.svelte'
  import TempChip from '../components/TempChip.svelte'
  import TempIcon from '../components/TempIcon.svelte'
  import { brewerLabel, formatClock, isEspresso, lapRows, paramsOf, ratio, stepLine } from '../lib/domain/brew'
  import { minutesSince, overallLabel } from '../lib/domain/tasting'
  import type { StartedFrom } from '../lib/domain/types'
  import { device } from '../lib/state/device.svelte'
  import { inventory } from '../lib/state/inventory.svelte'
  import { brews, brewers, grinders, recipes, tastings, users } from '../lib/state/live.svelte'
  import { href, navigate, route } from '../lib/state/router.svelte'
  import { dateTime } from '../lib/state/shortcuts.svelte'
  import { rateLink, ratedToast, tastingState } from '../lib/state/tastings.svelte'

  const STARTED_FROM: Record<StartedFrom, string> = { brew_again: 'Brew again', recipe: 'Recipe', freestyle: 'Freestyle' }

  const id = $derived(route.path.split('/')[2] ?? '')
  const brew = $derived(brews.get(id))
  const view = $derived(brew ? inventory.byId.get(brew.bag_id) : undefined)
  const brewer = $derived(users.get(brew?.brewer_user_id))
  const me = $derived(users.get(device.userId))
  const recipe = $derived(recipes.get(brew?.recipe_id))
  const laps = $derived(brew ? lapRows(brew.laps, brew.time_s) : [])

  const settings = $derived(
    brew
      ? ([
          ['Brewer', brewerLabel(brew, brewers.rows)],
          ['Grinder', [grinders.get(brew.grinder_id)?.name, brew.grind_setting].filter(Boolean).join(' · ')],
          ['Dose', brew.dose_g != null ? `${brew.dose_g} g` : ''],
          isEspresso(brew.method) ? ['Yield', brew.yield_g != null ? `${brew.yield_g} g` : ''] : ['Water', brew.water_g != null ? `${brew.water_g} g` : ''],
          ['Ratio', ratio(paramsOf(brew)) ?? ''],
          ['Temp', brew.temp_c != null ? `${brew.temp_c} °C` : ''],
          ['Time', brew.time_s != null ? formatClock(brew.time_s) : ''],
        ].filter(([, v]) => v) as [string, string][])
      : [],
  )

  const ratings = $derived(tastings.rows.filter((t) => t.brew_id === id).sort((a, b) => a.rated_at.localeCompare(b.rated_at)))

  async function rate(n: number) {
    if (!brew || !me) return
    const { undo } = await tastingState.rate(brew, me.id, n)
    ratedToast('', n, undo)
  }

  function back() {
    if (history.length > 1) history.back()
    else navigate('/')
  }
</script>

{#if !brew}
  <p class="muted">{brews.loaded ? 'This brew doesn’t exist (anymore).' : 'Loading…'}</p>
{:else}
  <div class="brew-detail stack">
    <button class="back" onclick={back}>‹ Back</button>

    <header>
      <Avatar user={brewer} size={40} />
      <span class="titles">
        <a class="bag" href={href(`/bag/${brew.bag_id}`)}>{view?.title ?? 'Bag'} ›</a>
        <span class="muted">{dateTime(brew.brewed_at)}{brewer ? ` · brewed by ${brewer.name}` : ''}</span>
      </span>
    </header>

    <section class="card stack" aria-label="Rate this cup">
      {#if me}
        <div class="row rate-head">
          <h2>Rate this cup</h2>
          <TempChip band={tastingState.bandFor(brew, me.id)} minutes={minutesSince(brew.brewed_at, tastingState.now)} oncycle={() => tastingState.cycle(brew, me.id)} />
        </div>
        <Stars value={null} label="Rate {view?.title ?? 'this cup'}" showLabel={false} onrate={rate} />
        <a class="more" href={href(rateLink(brew.id, me.id))}>More detail ›</a>
      {:else}
        <p class="muted">Add yourself in <a href={href('/settings')}>Settings</a> to rate this cup.</p>
      {/if}
    </section>

    <section class="stack" aria-label="Ratings">
      <h2>Ratings{ratings.length ? ` (${ratings.length})` : ''}</h2>
      {#each ratings as t (t.id)}
        {@const who = users.get(t.taster_id)}
        <a class="rating" href={href(rateLink(brew.id, t.taster_id, t.id))} aria-label="{who?.name ?? 'Someone'}'s rating from {dateTime(t.rated_at)}: edit">
          <Avatar user={who} size={28} />
          <span class="text">
            <span><span class="lit">{'★'.repeat(t.overall ?? 0)}</span> {overallLabel(t.overall)} · <TempIcon band={t.temp_band} word /></span>
            <span class="muted"
              >{who?.name ?? '?'} · {dateTime(t.rated_at)}{t.minutes_after_brew != null ? ` · ${Math.round(t.minutes_after_brew)} min after brewing` : ''}</span
            >
            {#if t.note}<span class="note">“{t.note}”</span>{/if}
          </span>
          <span class="edit">Edit</span>
        </a>
      {:else}
        <p class="muted">Not rated yet.</p>
      {/each}
    </section>

    <section class="stack" aria-label="Recipe">
      <h2>Recipe</h2>
      <p class="from">
        {#if recipe}
          {recipe.name ?? 'Untitled recipe'}{brew.recipe_version && brew.recipe_version > 1 ? ` · v${brew.recipe_version}` : ''}
        {:else}
          {brew.started_from ? STARTED_FROM[brew.started_from] : 'Freestyle'}
        {/if}
      </p>
      <dl>
        {#each settings as [k, v] (k)}<dt>{k}</dt><dd>{v}</dd>{/each}
      </dl>
      {#if brew.steps?.length}
        <ol class="steps">
          {#each brew.steps as s, i (i)}<li>{stepLine(s)}</li>{/each}
        </ol>
      {/if}
    </section>

    {#if laps.length}
      <section class="stack" aria-label="Laps">
        <h2>Laps</h2>
        <table>
          <thead><tr><th></th><th>At</th><th>Split</th></tr></thead>
          <tbody>
            {#each laps as l (l.label)}
              <tr><td>{l.label}</td><td>{formatClock(l.at_s)}</td><td class="muted">+{formatClock(l.split_s)}</td></tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}
  </div>
{/if}

<style>
  .brew-detail {
    max-width: 640px;
    margin: 0 auto;
    padding-bottom: 24px;
  }
  .back {
    align-self: flex-start;
    border: none;
    background: transparent;
    color: var(--accent);
    padding: 0;
    min-height: 40px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .titles {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .titles .muted {
    font-size: 14px;
  }
  .bag {
    color: var(--text);
    font-size: 20px;
    font-weight: 700;
    text-decoration: none;
  }
  h2 {
    margin: 0;
  }
  .rate-head {
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
  }
  .more,
  .card p a {
    color: var(--accent);
  }
  .more {
    align-self: flex-end;
    text-decoration: none;
    font-weight: 600;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
  }
  .rating {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    text-decoration: none;
    min-height: 44px;
  }
  .rating .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .rating .muted,
  .note {
    font-size: 14px;
  }
  .edit {
    color: var(--accent);
    font-weight: 600;
  }
  .lit {
    color: var(--accent);
  }
  .from {
    margin: 0;
    font-weight: 600;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    margin: 0;
  }
  dt {
    color: var(--text-muted);
  }
  dd {
    margin: 0;
  }
  .steps {
    margin: 0;
    padding-left: 20px;
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  table {
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th {
    text-align: left;
    font-weight: 400;
    font-size: 14px;
    color: var(--text-muted);
  }
  th,
  td {
    padding: 4px 16px 4px 0;
  }
  p {
    margin: 0;
  }
</style>
