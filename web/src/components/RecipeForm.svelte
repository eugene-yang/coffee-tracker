<script lang="ts">
  // A recipe belongs to one of the household's own brewers (its method comes from the brewer) and,
  // optionally, one of its grinders. Older recipes saved with only a method ask for a brewer on edit.
  import BrewerArt from './BrewerArt.svelte'
  import Stepper from './Stepper.svelte'
  import { isEspresso, methodLabel, parseSteps, stepsToText } from '../lib/domain/brew'
  import type { Brewer } from '../lib/domain/types'
  import { saveRecipe, type RecipeInput } from '../lib/equipment'
  import { device } from '../lib/state/device.svelte'
  import { href } from '../lib/state/router.svelte'
  import { brewers, grinders, kit, recipes } from '../lib/state/live.svelte'
  import { untrack } from 'svelte'

  let {
    initial,
    rootId = null,
    onsaved,
    oncancel,
  }: { initial: RecipeInput; rootId?: string | null; onsaved: (id: string) => void; oncancel: () => void } = $props()

  // Seeded once; the parent remounts the form for a different recipe
  let r = $state(untrack(() => structuredClone($state.snapshot(initial) as RecipeInput)))
  let stepsText = $state(stepsToText(r.steps))
  // Own brewers in use, plus a hidden one this recipe already names
  const choices = $derived([...kit.brewers, ...brewers.rows.filter((b) => b.hidden_at && b.id === r.brewer_id)])
  const legacy = untrack(() => !r.brewer_id && !!rootId)

  function pick(b: Brewer) {
    r.brewer_id = b.id
    r.method = b.method ?? r.method
  }

  async function save() {
    const id = await saveRecipe(recipes.rows, rootId, { ...$state.snapshot(r), steps: parseSteps(stepsText) } as RecipeInput, device.userId)
    onsaved(id)
  }
</script>

<div class="recipe-form stack">
  <label class="field">
    <span class="muted">Name</span>
    <input type="text" bind:value={r.name} placeholder="e.g. Daily V60" />
  </label>

  <div class="field">
    <span class="muted">Brewer{legacy && !r.brewer_id ? ` — this ${methodLabel(r.method)} recipe isn't tied to a brewer yet; pick one` : ''}</span>
    {#if choices.length}
      <div class="chips" role="radiogroup" aria-label="Brewer">
        {#each choices as b (b.id)}
          <button class="chip brewer" role="radio" aria-checked={r.brewer_id === b.id} class:on={r.brewer_id === b.id} onclick={() => pick(b)}>
            <BrewerArt illustrationKey={b.illustration} method={b.method} size={28} />{b.name}{b.hidden_at ? ' (hidden)' : ''}
          </button>
        {/each}
      </div>
    {:else}
      <span class="muted">Add a brewer in <a href={href('/settings/equipment')}>Equipment</a> first.</span>
    {/if}
  </div>
  <label class="field">
    <span class="muted">Grinder</span>
    <select bind:value={r.grinder_id}>
      <option value={null}>No grinder</option>
      {#each grinders.rows.filter((g) => !g.hidden_at || g.id === r.grinder_id) as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
    </select>
  </label>
  <label class="field">
    <span class="muted">Grind setting</span>
    <input type="text" bind:value={r.grind_setting} placeholder={grinders.get(r.grinder_id)?.setting_hint ?? 'e.g. 22'} />
  </label>

  <Stepper label="Dose" unit="g" step={0.5} value={r.dose_g} onchange={(v) => (r.dose_g = v)} />
  {#if isEspresso(r.method)}
    <Stepper label="Yield" unit="g" value={r.yield_g} onchange={(v) => (r.yield_g = v)} />
    <Stepper label="Time" unit="s" value={r.time_s} onchange={(v) => (r.time_s = v)} />
  {:else}
    <Stepper label="Water" unit="g" step={5} value={r.water_g} onchange={(v) => (r.water_g = v)} />
  {/if}
  <Stepper label="Temp" unit="°C" value={r.temp_c} onchange={(v) => (r.temp_c = v)} />

  <label class="field">
    <span class="muted">Steps — one per line; optional time and grams, e.g. “0:45 pour 150g”. Freestyle is fine.</span>
    <textarea rows="5" bind:value={stepsText} placeholder={'0:00 Bloom 50g\n0:45 Pour 150g\n1:30 Pour 250g'}></textarea>
  </label>
  <label class="field">
    <span class="muted">Note</span>
    <input type="text" bind:value={r.note} />
  </label>

  <div class="row">
    <button onclick={oncancel}>Cancel</button>
    <button class="primary" onclick={save} disabled={!r.brewer_id}>{rootId ? 'Save new version' : 'Save recipe'}</button>
  </div>
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .chip.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .chip.brewer {
    padding-left: 6px;
  }
  .field a {
    color: var(--accent);
  }
  select,
  textarea {
    min-height: var(--tap);
    padding: 8px 12px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--surface);
    width: 100%;
    font: inherit;
  }
  .row button {
    flex: 1;
  }
</style>
