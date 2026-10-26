<script lang="ts">
  import { device } from '../lib/state/device.svelte'
  import { users } from '../lib/state/live.svelte'
  import { href } from '../lib/state/router.svelte'
  import BrewShortcut from '../components/BrewShortcut.svelte'
  import RecentBrews from '../components/RecentBrews.svelte'
  import PendingCard from '../components/PendingCard.svelte'
  import { dismissCups, tastingState } from '../lib/state/tastings.svelte'
  import { shortcutsFor } from '../lib/state/shortcuts.svelte'

  const shortcuts = $derived(shortcutsFor())

  const me = $derived(users.get(device.userId))
  const pending = $derived(tastingState.forUser(device.userId))
</script>

<div class="stack">
  {#if users.loaded && !me}
    <div class="card stack">
      <strong>Welcome</strong>
      <p class="muted">Add yourself so brews and ratings are recorded under your name.</p>
      <a class="button-link" href={href('/settings')}>Set up this device</a>
    </div>
  {:else if me}
    <p class="muted">Hi {me.name}.</p>
  {/if}

  <section class="stack" aria-label="Pending tastings">
    <div class="section-head">
      <h2>Pending tastings</h2>
      {#if pending.length >= 2 && me}
        <button class="dismiss-all" onclick={() => dismissCups(pending.map((p) => p.brew.id), me.id)}>Dismiss all</button>
      {/if}
    </div>
    {#each pending as p (p.key)}
      <PendingCard {p} />
    {:else}
      <p class="muted">Recent cups show up here to rate.</p>
    {/each}
  </section>

  <section class="stack">
    <h2>{shortcuts.length ? 'Brew again' : 'Brew'}</h2>
    {#each shortcuts as s (s.brew.id)}<BrewShortcut shortcut={s} />{/each}
    <p class="muted"><a href={href('/inventory')}>Pick a bag in Inventory</a> to brew {shortcuts.length ? 'something else' : 'it'}.</p>
  </section>

  <section class="stack">
    <h2>Recent</h2>
    <RecentBrews />
  </section>
</div>

<style>
  .button-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--tap);
    border-radius: var(--radius);
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
    text-decoration: none;
  }
  p {
    margin: 0;
  }
  p a {
    color: var(--accent);
  }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .dismiss-all {
    min-height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 14px;
  }
</style>
