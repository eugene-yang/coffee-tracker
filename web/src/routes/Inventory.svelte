<script lang="ts">
  import BagCard from '../components/BagCard.svelte'
  import BagPanel from '../components/BagPanel.svelte'
  import CaptureButton from '../components/CaptureButton.svelte'
  import FilterSheet from '../components/FilterSheet.svelte'
  import BrewShortcut from '../components/BrewShortcut.svelte'
  import PendingStrip from '../components/PendingStrip.svelte'
  import { shortcutsFor } from '../lib/state/shortcuts.svelte'
  import { FLAVOR_FAMILIES } from '../lib/domain/flavors'
  import {
    SECTION_LABELS,
    SORT_LABELS,
    compareBy,
    compareSmart,
    sectionOf,
    type BagView,
    type SectionId,
    type SortKey,
  } from '../lib/domain/inventory'
  import { isFilterActive, matchesFilter, type StateChip } from '../lib/domain/search'
  import { currentLayout } from '../lib/state/device.svelte'
  import { inventory } from '../lib/state/inventory.svelte'
  import { bags } from '../lib/state/live.svelte'
  import { navigate } from '../lib/state/router.svelte'

  const layout = $derived(currentLayout())
  const shortcuts = $derived(shortcutsFor())
  const SECTION_ORDER: SectionId[] = ['needs_review', 'open', 'ready', 'resting', 'frozen']
  const STATE_CHIPS: { key: StateChip; label: string }[] = [
    { key: 'ready', label: 'Ready' },
    { key: 'low', label: 'Low' },
    { key: 'frozen', label: 'Frozen' },
  ]

  let sheetOpen = $state(false)
  let sortOpen = $state(false)
  let selectedId = $state<string | null>(null)

  const live = $derived(inventory.views)
  const searching = $derived(inventory.hits !== null)
  const filtering = $derived(isFilterActive(inventory.filter))
  const visible = $derived(
    new Set(live.filter((v) => matchesFilter(v, inventory.filter) && (!inventory.hits || inventory.hits.has(v.id))).map((v) => v.id)),
  )

  // Search results: one list by relevance, finished bags included (greyed)
  const results = $derived(
    searching
      ? live.filter((v) => visible.has(v.id)).sort((a, b) => inventory.hits!.get(b.id)!.score - inventory.hits!.get(a.id)!.score)
      : [],
  )

  // Browsing: sections in "brew next" order, or one flat list for other sorts
  const sections = $derived.by(() => {
    if (inventory.sort !== 'smart') {
      const sort = inventory.sort
      const all = live.filter((v) => v.state !== 'finished').sort((a, b) => compareBy(sort, a, b))
      return [{ id: 'all' as const, label: SORT_LABELS[sort], views: all }]
    }
    const groups = new Map<SectionId, BagView[]>()
    for (const v of live) {
      const s = sectionOf(v, layout)
      if (s) groups.set(s, [...(groups.get(s) ?? []), v])
    }
    return SECTION_ORDER.filter((s) => groups.has(s)).map((s) => ({
      id: s,
      label: SECTION_LABELS[s],
      views: groups.get(s)!.sort((a, b) => compareSmart(s, a, b)),
    }))
  })

  const activeChips = $derived([
    ...inventory.filter.roaster,
    ...inventory.filter.country,
    ...inventory.filter.process,
    ...inventory.filter.roast_level,
  ])

  function toggleState(key: StateChip) {
    const s = inventory.filter.states
    inventory.filter = { ...inventory.filter, states: s.includes(key) ? s.filter((x) => x !== key) : [...s, key] }
  }

  function toggleFamily(id: string) {
    const f = inventory.filter.families
    inventory.filter = { ...inventory.filter, families: f.includes(id) ? f.filter((x) => x !== id) : [...f, id] }
  }

  function select(id: string) {
    if (layout === 'station') selectedId = selectedId === id ? null : id
    else navigate(`/bag/${id}`)
  }

  function setSort(key: SortKey) {
    inventory.sort = key
    sortOpen = false
  }
</script>

{#snippet controls()}
  <div class="chips" role="toolbar" aria-label="Filters">
    {#each STATE_CHIPS as c (c.key)}
      <button
        class="chip"
        class:on={inventory.filter.states.includes(c.key)}
        aria-pressed={inventory.filter.states.includes(c.key)}
        onclick={() => toggleState(c.key)}>{c.label}</button
      >
    {/each}
    {#each FLAVOR_FAMILIES as f (f.id)}
      <button
        class="chip"
        class:on={inventory.filter.families.includes(f.id)}
        aria-pressed={inventory.filter.families.includes(f.id)}
        onclick={() => toggleFamily(f.id)}>{f.label}</button
      >
    {/each}
    <button class="chip" class:on={activeChips.length > 0} onclick={() => (sheetOpen = true)}
      >More{activeChips.length ? ` · ${activeChips.length}` : ''}</button
    >
    <button class="chip" aria-expanded={sortOpen} onclick={() => (sortOpen = !sortOpen)}>Sort: {SORT_LABELS[inventory.sort]}</button>
    {#if filtering || searching}
      <button class="chip clear" onclick={() => inventory.clear()}>Clear</button>
    {/if}
  </div>
  {#if sortOpen}
    <div class="sort-menu" role="menu">
      {#each Object.entries(SORT_LABELS) as [key, label] (key)}
        <button role="menuitemradio" aria-checked={inventory.sort === key} class:on={inventory.sort === key} onclick={() => setSort(key as SortKey)}
          >{label}</button
        >
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet list(views: BagView[])}
  <div class="list {layout}">
    {#each views as v (v.id)}
      <div class="cell" hidden={!visible.has(v.id)}>
        <BagCard
          view={v}
          rest={inventory.rest}
          {layout}
          why={inventory.hits?.get(v.id)?.why ?? null}
          selected={selectedId === v.id}
          onselect={select}
        />
      </div>
    {/each}
  </div>
{/snippet}

<div class="inventory {layout}" class:with-panel={layout === 'station' && selectedId}>
  <div class="main">
    {#if layout === 'phone'}
      <div class="top"><CaptureButton /></div>
    {:else}
      {@render controls()}
      {#if shortcuts.length}
        <div class="shortcuts" aria-label="Brew again">
          {#each shortcuts as s (s.brew.id)}<BrewShortcut shortcut={s} compact />{/each}
        </div>
      {/if}
    {/if}

    {#if bags.loaded && inventory.views.length === 0}
      <div class="empty card">
        <strong>No beans yet</strong>
        <p class="muted">{layout === 'station' ? 'Add bags from your phone.' : 'Photograph the front of each bag to add it.'}</p>
      </div>
    {:else if searching}
      <section>
        <h2>{results.length} result{results.length === 1 ? '' : 's'}</h2>
        {#if results.length}{@render list(results)}{:else}<p class="muted">Nothing matches “{inventory.text}”.</p>{/if}
      </section>
    {:else}
      {#each sections as s (s.id)}
        {@const shown = s.views.filter((v) => visible.has(v.id)).length}
        <section hidden={shown === 0}>
          <!-- Frozen is regular stock (bags are brewed straight from the freezer), so it's never collapsed -->
          <h2>{s.label}{s.id === 'needs_review' || s.id === 'frozen' ? ` (${shown})` : ''}</h2>
          {@render list(s.views)}
        </section>
      {/each}
      {#if filtering && visible.size === 0}
        <p class="muted">No bags match these filters.</p>
      {/if}
    {/if}
    {#if layout === 'station'}<PendingStrip />{/if}
  </div>

  {#if layout === 'station' && selectedId && inventory.byId.get(selectedId)}
    <BagPanel view={inventory.byId.get(selectedId)!} onclose={() => (selectedId = null)} />
  {/if}
</div>

{#if layout === 'phone'}
  <div class="dock">
    {@render controls()}
    <input type="search" class="search" placeholder="Search beans" bind:value={inventory.text} aria-label="Search beans" />
  </div>
{/if}

{#if sheetOpen}
  <FilterSheet onclose={() => (sheetOpen = false)} />
{/if}

<style>
  .inventory.phone {
    padding-bottom: 120px; /* room for the docked chips + search */
  }
  .inventory.station {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .top {
    display: flex;
    justify-content: flex-end;
  }
  .shortcuts {
    display: flex;
    gap: 12px;
  }
  .shortcuts :global(button) {
    min-height: 72px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .list.phone {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .list.station {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
    gap: 12px;
  }
  .cell[hidden],
  section[hidden] {
    display: none;
  }
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
  .station .chip {
    min-height: 56px;
  }
  .chip.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .chip.clear {
    border-style: dashed;
  }
  .sort-menu {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .sort-menu .on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .empty {
    text-align: center;
    padding: 32px 16px;
  }
  .empty p {
    margin: 8px 0 0;
  }
  .dock {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(57px + var(--bottom-inset));
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 16px;
    background: var(--bg);
    border-top: 1px solid var(--border);
  }
  .dock .chip {
    min-height: 40px;
  }
  .search {
    min-height: var(--tap);
    padding: 0 14px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--surface);
    width: 100%;
  }
</style>
