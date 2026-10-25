<script lang="ts">
  import MethodIcon from './MethodIcon.svelte'
  import Stepper from './Stepper.svelte'
  import { METHODS, isEspresso, methodLabel, parseSteps, stepsToText } from '../lib/domain/brew'
  import { saveRecipe, type RecipeInput } from '../lib/equipment'
  import { device } from '../lib/state/device.svelte'
  import { brewers, grinders, recipes } from '../lib/state/live.svelte'
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
  const methodBrewers = $derived(brewers.rows.filter((b) => b.method === r.method && (!b.hidden_at || b.id === r.brewer_id)))

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

  <div class="chips">
    {#each METHODS as m (m)}
      <button class="chip" class:on={r.method === m} aria-pressed={r.method === m} onclick={() => (r.method = m)}>
        <MethodIcon method={m} size={20} />
        {methodLabel(m)}
      </button>
    {/each}
  </div>

  <label class="field">
    <span class="muted">Brewer</span>
    <select bind:value={r.brewer_id}>
      <option value={null}>Any {methodLabel(r.method)}</option>
      {#each methodBrewers as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
    </select>
  </label>
  <label class="field">
    <span class="muted">Grinder</span>
    <select bind:value={r.grinder_id}>
      <option value={null}>—</option>
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
    <button class="primary" onclick={save}>{rootId ? 'Save new version' : 'Save recipe'}</button>
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
