<script lang="ts">
  // A bag's brews, newest first, each with the grinder and settings used and its ratings under it.
  // Phone: whose ratings follow the Mine · Everyone filter; station: everyone's, last few brews only.
  import Avatar from './Avatar.svelte'
  import WhoFilter from './WhoFilter.svelte'
  import { brewerLabel, paramSummary, paramsOf } from '../lib/domain/brew'
  import TempIcon from './TempIcon.svelte'
  import { overallLabel } from '../lib/domain/tasting'
  import { device } from '../lib/state/device.svelte'
  import { brewers, brews, grinders, tastings, users } from '../lib/state/live.svelte'
  import { href } from '../lib/state/router.svelte'
  import { dateTime } from '../lib/state/shortcuts.svelte'
  import { rateLink, ratingFilter, ratingMatches } from '../lib/state/tastings.svelte'

  let { bagId, limit, filter = true }: { bagId: string; limit?: number; filter?: boolean } = $props()

  const all = $derived(brews.rows.filter((b) => b.bag_id === bagId).sort((a, b) => b.brewed_at.localeCompare(a.brewed_at)))
  const shown = $derived(limit ? all.slice(0, limit) : all)
  const me = $derived(users.get(device.userId))
  const ratingsOf = (brewId: string) =>
    tastings.rows
      .filter((t) => t.brew_id === brewId && (!filter || ratingMatches(t, ratingFilter.who, device.userId)))
      .sort((a, b) => a.rated_at.localeCompare(b.rated_at))
</script>

<section class="stack history" aria-label="Brews and ratings">
  <h2>Brews &amp; ratings{all.length ? ` (${all.length})` : ''}</h2>
  {#if filter && all.length}<WhoFilter />{/if}
  {#each shown as b (b.id)}
    {@const brewer = users.get(b.brewer_user_id)}
    <article class="brew">
      <div class="head">
        <Avatar user={brewer} size={24} />
        <span class="text">
          <strong>{dateTime(b.brewed_at)} · {brewerLabel(b, brewers.rows)}</strong>
          <span class="muted">{[paramSummary(paramsOf(b)), grinders.get(b.grinder_id)?.name, brewer?.name && `by ${brewer.name}`].filter(Boolean).join(' · ')}</span>
        </span>
        {#if me}<a class="rate" href={href(rateLink(b.id, me.id))}>Rate</a>{/if}
      </div>
      {#each ratingsOf(b.id) as t (t.id)}
        <a class="rating" href={href(rateLink(b.id, t.taster_id, t.id))}>
          <Avatar user={users.get(t.taster_id)} size={20} />
          <span><span class="lit">{'★'.repeat(t.overall ?? 0)}</span> {overallLabel(t.overall)} <TempIcon band={t.temp_band} />{t.minutes_after_brew != null
              ? ` · ${Math.round(t.minutes_after_brew)} min`
              : ''}{t.note ? ` · “${t.note}”` : ''}</span>
        </a>
      {/each}
    </article>
  {:else}
    <p class="muted">Not brewed yet.</p>
  {/each}
  {#if limit && all.length > limit}<p class="muted">+ {all.length - limit} earlier — see the bag on a phone.</p>{/if}
</section>

<style>
  .brew {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .text .muted {
    font-size: 14px;
  }
  .rate,
  .rating {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
  }
  .rating {
    gap: 8px;
    padding-left: 34px;
    color: var(--text);
    font-weight: 400;
    min-height: 36px;
  }
  .lit {
    color: var(--accent);
  }
  p {
    margin: 0;
  }
</style>
