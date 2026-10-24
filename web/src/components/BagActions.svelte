<script lang="ts">
  // Status buttons for a bag: Open / Freeze / Thaw / Finish / ±grams, each with an undo toast
  import { addBagEvent, undoBagEvent } from '../lib/actions'
  import type { BagEventKind } from '../lib/domain/types'
  import type { BagView } from '../lib/domain/inventory'
  import { device } from '../lib/state/device.svelte'
  import { showToast } from '../lib/state/toast.svelte'

  let { view }: { view: BagView } = $props()

  const LABELS: Record<BagEventKind, string> = {
    opened: 'Opened',
    frozen: 'Moved to freezer',
    thawed: 'Out of the freezer',
    finished: 'Marked finished',
    adjust: 'Amount adjusted',
  }

  async function act(kind: BagEventKind, grams?: number) {
    const id = await addBagEvent(view.id, kind, device.userId, grams)
    showToast(kind === 'adjust' ? `${grams! > 0 ? '+' : ''}${grams} g` : LABELS[kind], () => undoBagEvent(id))
  }
</script>

{#if view.askFinished}
  <div class="ask">
    <span>Less than a cup left. Finished?</span>
    <button class="primary" onclick={() => act('finished')}>✓ Finished</button>
  </div>
{/if}

<div class="actions">
  {#if view.state === 'finished'}
    <span class="muted">Finished</span>
  {:else}
    {#if view.state !== 'open' && view.state !== 'frozen'}
      <button onclick={() => act('opened')}>Open</button>
    {/if}
    {#if view.state === 'frozen'}
      <button onclick={() => act('thawed')}>Thaw</button>
    {:else}
      <button onclick={() => act('frozen')}>Freeze</button>
    {/if}
    <button onclick={() => act('finished')}>Finish</button>
  {/if}
</div>

{#if view.gramsLeft != null && view.state !== 'finished'}
  <div class="grams">
    <span class="muted">Adjust</span>
    <button aria-label="Remove 10 grams" onclick={() => act('adjust', -10)}>−10 g</button>
    <button aria-label="Remove 1 gram" onclick={() => act('adjust', -1)}>−1</button>
    <button aria-label="Add 1 gram" onclick={() => act('adjust', 1)}>+1</button>
    <button aria-label="Add 10 grams" onclick={() => act('adjust', 10)}>+10 g</button>
  </div>
{/if}

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .actions button {
    flex: 1;
    min-width: 96px;
  }
  .grams {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .grams .muted {
    grid-column: 1 / -1;
    font-size: 14px;
  }
  .grams button {
    padding: 0;
  }
  .ask {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border-radius: var(--radius);
    border: 1px solid var(--warn);
  }
</style>
