<script lang="ts">
  import { device } from '../lib/state/device.svelte'
  import { users } from '../lib/state/live.svelte'
  import { href } from '../lib/state/router.svelte'
  import BrewShortcut from '../components/BrewShortcut.svelte'
  import RecentBrews from '../components/RecentBrews.svelte'
  import { shortcutsFor } from '../lib/state/shortcuts.svelte'

  const shortcuts = $derived(shortcutsFor())

  const me = $derived(users.get(device.userId))
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

  <section class="stack">
    <h2>Pending tastings</h2>
    <p class="muted">Cups waiting for a rating show up here.</p>
  </section>

  {#if shortcuts.length}
    <section class="stack">
      <h2>Brew again</h2>
      {#each shortcuts as s (s.bagId + s.brew.method)}<BrewShortcut shortcut={s} />{/each}
    </section>
  {/if}

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
</style>
