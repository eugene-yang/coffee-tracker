<script lang="ts">
  import Avatar from './Avatar.svelte'
  import MethodIcon from './MethodIcon.svelte'
  import { brewerLabel, paramSummary, paramsOf } from '../lib/domain/brew'
  import { inventory } from '../lib/state/inventory.svelte'
  import { latestTastings } from '../lib/domain/tasting'
  import { brewers, brews, tastings, users } from '../lib/state/live.svelte'
  import { timeAgo } from '../lib/state/shortcuts.svelte'

  let { limit = 8 }: { limit?: number } = $props()

  const recent = $derived([...brews.rows].sort((a, b) => b.brewed_at.localeCompare(a.brewed_at)).slice(0, limit))
  const latest = $derived([...latestTastings(tastings.rows).values()])
  const ratingsOf = (brewId: string) => latest.filter((t) => t.brew_id === brewId && t.overall)
</script>

{#each recent as b (b.id)}
  <div class="brew">
    <MethodIcon method={b.method} />
    <span class="text">
      <strong>{inventory.byId.get(b.bag_id)?.title ?? 'Bag'}</strong>
      <span class="muted">{brewerLabel(b, brewers.rows)} · {paramSummary(paramsOf(b))}</span>
      {#if ratingsOf(b.id).length}
        <span class="ratings">
          {#each ratingsOf(b.id) as t (t.id)}
            <span class="rating" title={users.get(t.taster_id)?.name}><Avatar user={users.get(t.taster_id)} size={18} />★{t.overall}</span>
          {/each}
        </span>
      {/if}
    </span>
    <span class="meta">
      <Avatar user={users.get(b.brewer_user_id)} size={24} />
      <span class="muted">{timeAgo(b.brewed_at)}</span>
    </span>
  </div>
{:else}
  <p class="muted">Nothing brewed yet.</p>
{/each}

<style>
  .brew {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }
  .text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .text .muted,
  .meta .muted {
    font-size: 14px;
  }
  .ratings {
    display: flex;
    gap: 10px;
    font-size: 14px;
  }
  .rating {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--accent);
    font-weight: 600;
  }
  .meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }
  p {
    margin: 0;
  }
</style>
