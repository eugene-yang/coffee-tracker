<script lang="ts">
  import { facetCounts, type Facet } from '../lib/domain/search'
  import { inventory } from '../lib/state/inventory.svelte'

  let { onclose }: { onclose: () => void } = $props()

  const FACETS: { key: Facet; label: string }[] = [
    { key: 'roaster', label: 'Roaster' },
    { key: 'country', label: 'Origin' },
    { key: 'process', label: 'Process' },
    { key: 'roast_level', label: 'Roast level' },
  ]

  function toggle(facet: Facet, value: string) {
    const list = inventory.filter[facet]
    inventory.filter = {
      ...inventory.filter,
      [facet]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    }
  }
</script>

<div class="backdrop" role="presentation" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-label="Filters">
  {#each FACETS as f (f.key)}
    {@const values = facetCounts(inventory.views, inventory.filter, f.key)}
    {#if values.length}
      <section>
        <h2>{f.label}</h2>
        <div class="chips">
          {#each values as [value, count] (value)}
            <button
              class="chip"
              class:on={inventory.filter[f.key].includes(value)}
              aria-pressed={inventory.filter[f.key].includes(value)}
              onclick={() => toggle(f.key, value)}>{value} <span class="count">{count}</span></button
            >
          {/each}
        </div>
      </section>
    {/if}
  {:else}
    <p class="muted">Nothing to filter yet.</p>
  {/each}
  <div class="actions">
    <button onclick={() => inventory.clear()}>Clear</button>
    <button class="primary" onclick={onclose}>Done</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.5);
    z-index: 30;
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 31;
    max-height: 80dvh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px 16px calc(16px + var(--bottom-inset));
    background: var(--surface);
    border-radius: 16px 16px 0 0;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .count {
    color: var(--text-muted);
    font-size: 13px;
    margin-left: 4px;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 12px;
  }
</style>
