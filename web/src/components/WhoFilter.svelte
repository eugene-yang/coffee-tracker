<script lang="ts">
  // Mine · Everyone · one person: whose ratings to show (shared by Tastings and bag history)
  import { device } from '../lib/state/device.svelte'
  import { users } from '../lib/state/live.svelte'
  import { ratingFilter } from '../lib/state/tastings.svelte'

  const options = $derived([
    ...(users.get(device.userId) ? [{ key: 'mine', label: 'Mine' }] : []),
    { key: 'everyone', label: 'Everyone' },
    ...users.rows.filter((u) => u.id !== device.userId).map((u) => ({ key: u.id, label: u.name ?? '?' })),
  ])
  // Nobody on this device yet: "Mine" has nothing to show
  $effect(() => {
    if (users.loaded && ratingFilter.who === 'mine' && !users.get(device.userId)) ratingFilter.who = 'everyone'
  })
</script>

<div class="chips" role="radiogroup" aria-label="Whose ratings">
  {#each options as o (o.key)}
    <button class="chip" role="radio" aria-checked={ratingFilter.who === o.key} class:on={ratingFilter.who === o.key} onclick={() => (ratingFilter.who = o.key)}
      >{o.label}</button
    >
  {/each}
</div>

<style>
  .chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .chip {
    flex: none;
    white-space: nowrap;
  }
  .chip.on {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
