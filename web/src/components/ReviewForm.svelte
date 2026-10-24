<script lang="ts">
  // Label review (phone): photo-assisted form; label-reader suggestions are marked with a dot until confirmed
  import { untrack } from 'svelte'
  import {
    REVIEW_FIELDS,
    emptyForm,
    formFromCoffee,
    retryExtraction,
    saveReview,
    suggestionsFrom,
    type ReviewField,
  } from '../lib/actions'
  import { FLAVOR_FAMILIES, tagsFromNotes } from '../lib/domain/flavors'
  import type { BagView } from '../lib/domain/inventory'
  import { aliases, coffees, extractions, roasters } from '../lib/state/live.svelte'

  let { view, onsaved }: { view: BagView; onsaved: () => void } = $props()

  const LABELS: Record<ReviewField, string> = {
    roaster: 'Roaster',
    name: 'Coffee',
    roast_date: 'Roast date',
    weight_g: 'Weight (g)',
    origin: 'Origin',
    producer: 'Producer / farm',
    variety: 'Variety',
    process: 'Process',
    roast_level: 'Roast level',
    altitude: 'Altitude',
    tasting_notes: 'Roaster’s tasting notes',
    notes: 'Other notes',
  }
  const PRIMARY: ReviewField[] = ['roaster', 'name', 'roast_date', 'weight_g']
  const MORE = REVIEW_FIELDS.filter((f) => !PRIMARY.includes(f))

  const extraction = $derived(extractions.get(view.id))
  const suggestions = $derived(suggestionsFrom(extraction, aliases.rows))

  // Reviewed bags edit their saved values; new bags start blank and fill in as suggestions arrive.
  // The form is seeded once per bag (the parent keys this component by bag id).
  const initial = untrack(() => ({
    form: view.needsReview ? emptyForm() : formFromCoffee(view.coffee, view.roaster, view.bag),
    tags: view.coffee?.flavor_tags ?? null,
    needsReview: view.needsReview,
  }))
  let form = $state(initial.form)
  let touched = $state(new Set<ReviewField>())
  let fromLabel = $state(new Set<ReviewField>())
  let showMore = $state(!initial.needsReview)
  let tags = $state<string[] | null>(initial.tags)
  let saving = $state(false)

  $effect(() => {
    const s = suggestions
    if (!view.needsReview) return
    untrack(() => {
      const next = new Set(fromLabel)
      for (const f of REVIEW_FIELDS) {
        if (s[f] && !touched.has(f)) {
          form[f] = s[f]!
          next.add(f)
        }
      }
      fromLabel = next
    })
  })

  const shownTags = $derived(tags ?? tagsFromNotes(form.tasting_notes.split(',').map((t) => t.trim())))
  const allTags = FLAVOR_FAMILIES.flatMap((f) => f.tags)

  function edit(f: ReviewField) {
    touched = new Set(touched).add(f)
    if (fromLabel.has(f)) {
      const next = new Set(fromLabel)
      next.delete(f)
      fromLabel = next
    }
  }

  function toggleTag(id: string) {
    const current = shownTags
    tags = current.includes(id) ? current.filter((t) => t !== id) : [...current, id]
  }

  // Autocomplete from values already in the inventory plus canonical alias spellings
  function options(f: ReviewField): string[] {
    const fromCoffees: Record<string, (c: (typeof coffees.rows)[number]) => string | null> = {
      origin: (c) => c.origin,
      variety: (c) => c.variety,
      process: (c) => c.process,
      roast_level: (c) => c.roast_level,
      producer: (c) => c.producer,
    }
    const values = new Set<string>()
    if (f === 'roaster') roasters.rows.forEach((r) => r.name && values.add(r.name))
    if (fromCoffees[f]) coffees.rows.forEach((c) => fromCoffees[f](c) && values.add(fromCoffees[f](c)!))
    aliases.rows.filter((a) => a.kind === f).forEach((a) => values.add(a.canonical))
    return [...values].sort()
  }

  async function save() {
    saving = true
    try {
      await saveReview({
        bagId: view.id,
        form: $state.snapshot(form),
        flavorTags: tags,
        roasters: roasters.rows,
        coffees: coffees.rows,
        aliases: aliases.rows,
        currentCoffeeId: view.bag.coffee_id,
        suggestions,
        hasExtraction: extraction?.status === 'done',
      })
      onsaved()
    } finally {
      saving = false
    }
  }
</script>

{#snippet field(f: ReviewField)}
  <label class="field">
    <span class="label">{LABELS[f]}{#if fromLabel.has(f)}<span class="dot" title="Read from the label — check it"></span>{/if}</span>
    {#if f === 'roast_date'}
      <input type="date" bind:value={form[f]} oninput={() => edit(f)} />
    {:else if f === 'weight_g'}
      <input type="number" inputmode="decimal" min="0" bind:value={form[f]} oninput={() => edit(f)} />
    {:else}
      <input type="text" list="opts-{f}" bind:value={form[f]} oninput={() => edit(f)} autocomplete="off" />
      {#if options(f).length}
        <datalist id="opts-{f}">
          {#each options(f) as o (o)}<option value={o}></option>{/each}
        </datalist>
      {/if}
    {/if}
  </label>
{/snippet}

<div class="review stack">
  {#if view.needsReview}
    <div class="status">
      {#if !extraction || extraction.status === 'queued' || extraction.status === 'running'}
        <span class="muted">Reading the label… you can fill things in meanwhile.</span>
      {:else if extraction.status === 'error'}
        <span class="muted">Couldn’t read the label{extraction.error ? ` (${extraction.error})` : ''}.</span>
        <button onclick={() => retryExtraction(view.id)}>Retry</button>
      {:else}
        <span class="muted">Read from the label — fields with a dot need a quick check.</span>
      {/if}
    </div>
  {/if}

  {#each PRIMARY as f (f)}{@render field(f)}{/each}

  <button class="more" aria-expanded={showMore} onclick={() => (showMore = !showMore)}>
    {showMore ? 'Fewer details' : 'More details'}
  </button>
  {#if showMore}
    {#each MORE as f (f)}{@render field(f)}{/each}
    <div class="stack">
      <span class="label">Flavor tags</span>
      <div class="tags">
        {#each allTags.filter((t) => shownTags.includes(t.id)) as t (t.id)}
          <button class="tag on" onclick={() => toggleTag(t.id)}>{t.label} ✕</button>
        {/each}
        <select
          aria-label="Add a flavor tag"
          onchange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value
            if (v) toggleTag(v)
            ;(e.currentTarget as HTMLSelectElement).value = ''
          }}
        >
          <option value="">+ Add tag</option>
          {#each FLAVOR_FAMILIES as fam (fam.id)}
            <optgroup label={fam.label}>
              {#each fam.tags.filter((t) => !shownTags.includes(t.id)) as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
            </optgroup>
          {/each}
        </select>
      </div>
    </div>
  {/if}

  <button class="primary save" disabled={saving} onclick={save}>{view.needsReview ? 'Looks right' : 'Save'}</button>
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .label {
    font-size: 14px;
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }
  input[type='date'],
  input[type='number'],
  select {
    min-height: var(--tap);
    padding: 0 12px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--surface);
    width: 100%;
  }
  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .more {
    border-style: dashed;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .tag.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .tags select {
    width: auto;
  }
  .save {
    min-height: 56px;
    font-weight: 700;
  }
</style>
