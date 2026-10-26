<script lang="ts">
  // Station: recent cups below the grid, one each. Anyone can rate any cup: tap your avatar for a big
  // sheet with your name on it. Each avatar shows that person's latest stars.
  import Avatar from './Avatar.svelte'
  import StarsSheet from './StarsSheet.svelte'
  import TempIcon from './TempIcon.svelte'
  import type { Brew } from '../lib/domain/types'
  import { brewerLabel } from '../lib/domain/brew'
  import { suggestTempBand } from '../lib/domain/tempBand'
  import { inventory } from '../lib/state/inventory.svelte'
  import { brewers, users } from '../lib/state/live.svelte'
  import { tastingState } from '../lib/state/tastings.svelte'

  let sheet = $state<{ brew: Brew; userId: string } | null>(null)

  const titleOf = (b: Brew) => inventory.byId.get(b.bag_id)?.title ?? 'Bag'
</script>

{#if tastingState.cups.length && users.rows.length}
  <section class="strip" aria-label="Pending tastings">
    {#each tastingState.cups as c (c.brew.id)}
      <div class="item" role="group" aria-label="Cup: {titleOf(c.brew)}">
        <span class="text">
          <span class="title">{titleOf(c.brew)}</span>
          <span class="muted">{brewerLabel(c.brew, brewers.rows)} · <TempIcon band={suggestTempBand(c.minutes, tastingState.thresholds)} size={16} word /> · {Math.round(c.minutes)}m</span>
        </span>
        <span class="who">
          {#each users.rows.filter((u) => !c.dismissed.has(u.id)) as u (u.id)}
            {@const t = c.latest.get(u.id)}
            <button class="person" class:rated={!!t} aria-label="Rate {titleOf(c.brew)} as {u.name}" onclick={() => (sheet = { brew: c.brew, userId: u.id })}>
              <Avatar user={u} size={40} />
              <span class="stars">{t?.overall ? `★${t.overall}` : 'Rate'}</span>
            </button>
          {/each}
        </span>
      </div>
    {/each}
  </section>
{/if}

{#if sheet}
  <StarsSheet brew={sheet.brew} userId={sheet.userId} onclose={() => (sheet = null)} />
{/if}

<style>
  .strip {
    position: sticky;
    bottom: 0;
    z-index: 5;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 8px 0 16px;
    background: var(--bg);
    border-top: 1px solid var(--border);
  }
  .item {
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 6px 4px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .title {
    font-size: 15px;
    font-weight: 600;
    max-width: 220px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .text .muted {
    font-size: 13px;
  }
  .who {
    display: flex;
    gap: 4px;
  }
  .person {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-height: 72px;
    min-width: 64px;
    padding: 4px;
    border: none;
    background: transparent;
  }
  .stars {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .person.rated .stars {
    color: var(--accent);
  }
</style>
