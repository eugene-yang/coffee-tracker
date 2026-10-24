<script lang="ts">
  // Station: everyone's cups waiting for a rating, below the grid. A star next to your avatar rates in one tap;
  // tapping the avatar opens a bigger sheet with your name on it.
  import Avatar from './Avatar.svelte'
  import Stars from './Stars.svelte'
  import StarsSheet from './StarsSheet.svelte'
  import TempChip from './TempChip.svelte'
  import { TEMP_BAND_LABELS, type PendingTasting } from '../lib/domain/tasting'
  import { inventory } from '../lib/state/inventory.svelte'
  import { users } from '../lib/state/live.svelte'
  import { ratedToast, tastingState } from '../lib/state/tastings.svelte'

  let sheetKey = $state<string | null>(null)
  const sheet = $derived(tastingState.all.find((p) => p.key === sheetKey))

  const titleOf = (p: PendingTasting) => inventory.byId.get(p.brew.bag_id)?.title ?? 'Bag'

  async function rate(p: PendingTasting, n: number) {
    const { undo } = await tastingState.rate(p, n)
    ratedToast(users.get(p.userId)?.name ?? '', n, undo)
  }
</script>

{#if tastingState.all.length}
  <section class="strip" aria-label="Pending tastings">
    {#each tastingState.all as p (p.key)}
      {@const user = users.get(p.userId)}
      {#if p.state === 'waiting'}
        <div class="item muted">
          <Avatar {user} size={40} />
          <span class="text">
            <span class="title">{user?.name} · {titleOf(p)}</span>
            <span>{'★'.repeat(p.last?.overall ?? 0)} · again when {TEMP_BAND_LABELS[p.nextBand ?? 'warm']}</span>
          </span>
        </div>
      {:else}
        <div class="item">
          <button class="who" aria-label="Rate as {user?.name}" onclick={() => (sheetKey = p.key)}><Avatar {user} size={48} /></button>
          <span class="text">
            <span class="title">{user?.name} · {titleOf(p)}</span>
            <Stars
              value={p.state === 'editing' ? p.last?.overall : null}
              size={56}
              showLabel={false}
              label="{user?.name}: {titleOf(p)}"
              onrate={(n) => rate(p, n)}
            />
          </span>
          <TempChip band={tastingState.bandOf(p)} minutes={p.minutes} now={p.state === 'again'} compact oncycle={() => tastingState.cycleBand(p)} />
        </div>
      {/if}
    {/each}
  </section>
{/if}

{#if sheet}
  <StarsSheet p={sheet} onclose={() => (sheetKey = null)} />
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
    gap: 4px;
    padding: 4px 6px 4px 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .item.muted {
    background: transparent;
    padding: 8px 16px 8px 8px;
  }
  .who {
    width: 52px;
    min-height: 56px;
    padding: 0;
    border: none;
    background: transparent;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .title {
    font-size: 15px;
    max-width: 280px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item :global(.temp) {
    min-height: 56px;
    padding: 0 10px;
  }
  .item :global(.stars) {
    gap: 0;
  }
</style>
