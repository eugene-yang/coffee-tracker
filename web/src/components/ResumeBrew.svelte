<script lang="ts">
  // A brew that's timing (or waiting to be saved) is one tap away from every screen but its own
  import { formatClock } from '../lib/domain/brew'
  import { brewState } from '../lib/state/brew.svelte'
  import { inventory } from '../lib/state/inventory.svelte'
  import { href, route } from '../lib/state/router.svelte'

  let now = $state(Date.now())
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000)
    return () => clearInterval(t)
  })

  const draft = $derived(brewState.draft)
  const shown = $derived(!!draft && draft.phase !== 'setup' && !route.path.startsWith('/brew/'))
</script>

{#if shown && draft}
  <a class="resume" href={href(`/brew/${draft.bagId}`)}>
    <strong>Brew in progress · {inventory.byId.get(draft.bagId)?.title ?? 'Bag'}</strong>
    <span>{draft.phase === 'running' ? formatClock(brewState.elapsedS(now)) : 'Tap to save'}</span>
  </a>
{/if}

<style>
  .resume {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: var(--tap);
    padding: 0 16px;
    background: var(--accent);
    color: var(--accent-text);
    text-decoration: none;
    font-variant-numeric: tabular-nums;
  }
  .resume strong {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
