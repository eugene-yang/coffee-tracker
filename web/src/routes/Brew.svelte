<script lang="ts">
  // Phone Brew tab: resume a running brew, Brew again shortcuts, or pick a bag
  import BrewShortcut from '../components/BrewShortcut.svelte'
  import Photo from '../components/Photo.svelte'
  import { formatClock } from '../lib/domain/brew'
  import { brewState } from '../lib/state/brew.svelte'
  import { inventory } from '../lib/state/inventory.svelte'
  import { href } from '../lib/state/router.svelte'
  import { shortcutsFor } from '../lib/state/shortcuts.svelte'

  const draft = $derived(brewState.draft)
  const shortcuts = $derived(shortcutsFor())
  const order = { open: 0, ready: 1, resting: 2, frozen: 3, finished: 4 }
  const bags = $derived(
    inventory.views
      .filter((v) => v.state !== 'finished' && v.state !== 'frozen' && !inventory.hidden.has(v.id))
      .sort((a, b) => order[a.state] - order[b.state] || a.title.localeCompare(b.title)),
  )
</script>

<div class="stack">
  {#if draft && draft.phase !== 'setup'}
    <a class="card resume" href={href(`/brew/${draft.bagId}`)}>
      <strong>Brew in progress · {inventory.byId.get(draft.bagId)?.title}</strong>
      <span class="muted">{draft.phase === 'running' ? `Timer ${formatClock(brewState.elapsedS())}` : 'Waiting for Done'}</span>
    </a>
  {/if}

  {#if shortcuts.length}
    <section class="stack">
      <h2>Brew again</h2>
      {#each shortcuts as s (s.bagId + s.brew.method)}<BrewShortcut shortcut={s} />{/each}
    </section>
  {/if}

  <section class="stack">
    <h2>Pick a bag</h2>
    {#each bags as v (v.id)}
      <a class="bag" href={href(`/brew/${v.id}`)}>
        <span class="thumb"><Photo id={v.photoIds[0]} /></span>
        <span class="text">
          <strong>{v.title}</strong>
          <span class="muted">{v.roasterName}{v.state === 'resting' ? ' · resting' : ''}</span>
        </span>
      </a>
    {:else}
      <p class="muted">No beans to brew yet — add a bag in Inventory.</p>
    {/each}
  </section>
</div>

<style>
  .resume {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--text);
    text-decoration: none;
    border-color: var(--accent);
  }
  .bag {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
  }
  .thumb {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    overflow: hidden;
    flex: none;
  }
  .text {
    display: flex;
    flex-direction: column;
  }
  .text .muted {
    font-size: 14px;
  }
  p {
    margin: 0;
  }
</style>
