<script lang="ts">
  import BrewerArt from '../components/BrewerArt.svelte'
  import MethodIcon from '../components/MethodIcon.svelte'
  import RecipeForm from '../components/RecipeForm.svelte'
  import { METHODS, brewerLabel, defaultParams, latestRecipes, methodLabel, paramSummary, paramsOf, pickBrewer as usualBrewer, pickGrinder as usualGrinder } from '../lib/domain/brew'
  import type { Brewer, Grinder } from '../lib/domain/types'
  import ConfirmDialog from '../components/ConfirmDialog.svelte'
  import { deleteRecipe, recipeEditedLabel, saveBrewer, saveGrinder, setEquipmentHidden } from '../lib/equipment'
  import { ILLUSTRATIONS, illustration } from '../lib/illustrations'
  import { device } from '../lib/state/device.svelte'
  import { brewers, brews, grinders, kit, recipes } from '../lib/state/live.svelte'
  import { href } from '../lib/state/router.svelte'
  import { showToast } from '../lib/state/toast.svelte'

  // ---- brewers
  let editingBrewer = $state<string | null>(null) // id, or 'new'
  let brewerForm = $state({ name: '', method: 'pour_over', filter: '', illustration: null as string | null })

  function editBrewer(b: Brewer | null) {
    editingBrewer = b?.id ?? 'new'
    brewerForm = { name: b?.name ?? '', method: b?.method ?? 'pour_over', filter: b?.filter ?? '', illustration: b?.illustration ?? null }
    if (!b) brewerForm.name = autoName()
  }

  // Most households own one of each brewer, so the name defaults to the brewer itself (the picture's
  // brewer, else the type) and follows the picks until it's typed over
  function autoName(): string {
    return illustration(brewerForm.illustration)?.name ?? methodLabel(brewerForm.method)
  }

  function pickBrewer(patch: Partial<typeof brewerForm>) {
    const auto = !brewerForm.name.trim() || brewerForm.name === autoName()
    Object.assign(brewerForm, patch)
    if (auto) brewerForm.name = autoName()
  }

  async function submitBrewer() {
    if (!brewerForm.name.trim()) return
    await saveBrewer(editingBrewer === 'new' ? null : editingBrewer, brewerForm)
    editingBrewer = null
  }

  // ---- grinders
  let editingGrinder = $state<string | null>(null)
  let grinderForm = $state({ name: '', setting_hint: '' })

  function editGrinder(g: Grinder | null) {
    editingGrinder = g?.id ?? 'new'
    grinderForm = { name: g?.name ?? '', setting_hint: g?.setting_hint ?? '' }
  }

  async function submitGrinder() {
    if (!grinderForm.name.trim()) return
    await saveGrinder(editingGrinder === 'new' ? null : editingGrinder, grinderForm)
    editingGrinder = null
  }

  // ---- hidden (retired) equipment: off the brew screen, still named on old brews
  const hiddenBrewers = $derived(brewers.rows.filter((b) => b.hidden_at))
  const hiddenGrinders = $derived(grinders.rows.filter((g) => g.hidden_at))

  async function hide(table: 'brewer' | 'grinder', id: string, name: string | null) {
    await setEquipmentHidden(table, id, true)
    if (table === 'brewer') editingBrewer = null
    else editingGrinder = null
    showToast(`${name ?? 'Equipment'} hidden`, () => setEquipmentHidden(table, id, false))
  }

  // ---- recipes
  let editingRecipe = $state<string | null>(null) // root id, or 'new'
  let deletingRecipe = $state<{ rootId: string; name: string | null } | null>(null)

  /** A new recipe starts on the brewer and grinder this person uses most. */
  function newRecipe() {
    const b = usualBrewer(kit.brewers, brews.rows, device.userId, {})
    const g = usualGrinder(kit.grinders, brews.rows, device.userId, null)
    return { ...defaultParams(b?.method ?? 'pour_over'), brewer_id: b?.id ?? null, grinder_id: g?.id ?? null, name: '', note: '' }
  }
  const latest = $derived(latestRecipes(recipes.rows))
</script>

<div class="stack equipment">
  <a class="back" href={href('/settings')}>‹ Settings</a>

  <section class="stack">
    <h2>Brewers</h2>
    {#each kit.brewers as b (b.id)}
      {#if editingBrewer === b.id}
        {@render brewerEditor()}
      {:else}
        <button class="item" onclick={() => editBrewer(b)}>
          <BrewerArt illustrationKey={b.illustration} method={b.method} size={56} />
          <span class="text">
            <strong>{b.name}</strong>
            <span class="muted">{methodLabel(b.method)}{b.filter ? ` · ${b.filter}` : ''}</span>
          </span>
        </button>
      {/if}
    {/each}
    {#if editingBrewer === 'new'}{@render brewerEditor()}{:else}<button onclick={() => editBrewer(null)}>+ Add brewer</button>{/if}
  </section>

  <section class="stack">
    <h2>Grinders</h2>
    {#each kit.grinders as g (g.id)}
      {#if editingGrinder === g.id}
        {@render grinderEditor()}
      {:else}
        <button class="item" onclick={() => editGrinder(g)}>
          <span class="text"><strong>{g.name}</strong>{#if g.setting_hint}<span class="muted">Settings like {g.setting_hint}</span>{/if}</span>
        </button>
      {/if}
    {/each}
    {#if editingGrinder === 'new'}{@render grinderEditor()}{:else}<button onclick={() => editGrinder(null)}>+ Add grinder</button>{/if}
  </section>

  {#if hiddenBrewers.length || hiddenGrinders.length}
    <section class="stack" aria-label="Hidden equipment">
      <h2>Hidden</h2>
      <p class="muted">Not offered for new brews; old brews still show them.</p>
      {#each hiddenBrewers as b (b.id)}
        <div class="row hidden-item">
          <BrewerArt illustrationKey={b.illustration} method={b.method} size={40} />
          <span class="text"><strong>{b.name}</strong><span class="muted">{methodLabel(b.method)}</span></span>
          <button onclick={() => setEquipmentHidden('brewer', b.id, false)}>Unhide</button>
        </div>
      {/each}
      {#each hiddenGrinders as g (g.id)}
        <div class="row hidden-item">
          <span class="text"><strong>{g.name}</strong><span class="muted">Grinder</span></span>
          <button onclick={() => setEquipmentHidden('grinder', g.id, false)}>Unhide</button>
        </div>
      {/each}
    </section>
  {/if}

  <section class="stack">
    <h2>Recipes</h2>
    <p class="muted">Most recipes start from “Save as recipe” after a brew. Editing saves a new version; old brews keep what they used.</p>
    {#each latest as r (r.root_id)}
      {#if editingRecipe === r.root_id}
        <div class="card">
          <RecipeForm
            initial={{ ...paramsOf(r), name: r.name ?? '', note: r.note ?? '' }}
            rootId={r.root_id}
            onsaved={() => (editingRecipe = null)}
            oncancel={() => (editingRecipe = null)}
          />
          <button class="danger" onclick={() => (deletingRecipe = { rootId: r.root_id, name: r.name })}>Delete recipe</button>
        </div>
      {:else}
        <button class="item" onclick={() => (editingRecipe = r.root_id)}>
          <MethodIcon method={r.method} />
          <span class="text">
            <strong>{r.name}</strong>
            <span class="muted">{[brewers.get(r.brewer_id) ? `${brewerLabel(r, brewers.rows)}${brewers.get(r.brewer_id)?.hidden_at ? ' (hidden)' : ''}` : `Any ${methodLabel(r.method)}`, paramSummary(paramsOf(r))].filter(Boolean).join(' · ')}</span>
            <span class="muted small">{recipeEditedLabel(r)}</span>
          </span>
        </button>
      {/if}
    {/each}
    {#if editingRecipe === 'new'}
      <div class="card">
        <RecipeForm
          initial={newRecipe()}
          onsaved={() => (editingRecipe = null)}
          oncancel={() => (editingRecipe = null)}
        />
      </div>
    {:else}
      <button onclick={() => (editingRecipe = 'new')}>+ New recipe</button>
    {/if}
  </section>
</div>

{#if deletingRecipe}
  <ConfirmDialog
    title="Delete the recipe “{deletingRecipe.name}”?"
    message="All its versions go; brews made with it keep their settings."
    onconfirm={async () => {
      const { rootId } = deletingRecipe!
      deletingRecipe = null
      await deleteRecipe(recipes.rows, rootId)
      editingRecipe = null
      showToast('Recipe deleted')
    }}
    oncancel={() => (deletingRecipe = null)}
  />
{/if}

{#snippet brewerEditor()}
  <div class="card stack">
    <input type="text" bind:value={brewerForm.name} placeholder="Name, e.g. Origami" aria-label="Brewer name" />
    <div class="chips">
      {#each METHODS as m (m)}
        <button class="chip" class:on={brewerForm.method === m} onclick={() => pickBrewer({ method: m })}>
          <MethodIcon method={m} size={20} />{methodLabel(m)}
        </button>
      {/each}
    </div>
    <input type="text" bind:value={brewerForm.filter} placeholder="Filter (optional)" aria-label="Filter" />
    <span class="muted">Picture</span>
    <div class="art-grid">
      <button class="art" class:on={!brewerForm.illustration} onclick={() => pickBrewer({ illustration: null })}>
        <BrewerArt illustrationKey={null} method={brewerForm.method} size={64} />
        <span class="small">Icon</span>
      </button>
      {#each ILLUSTRATIONS as ill (ill.key)}
        <button class="art" class:on={brewerForm.illustration === ill.key} onclick={() => pickBrewer({ illustration: ill.key, method: ill.method })}>
          <BrewerArt illustrationKey={ill.key} method={ill.method} size={64} />
          <span class="small">{ill.name}</span>
        </button>
      {/each}
    </div>
    <div class="row">
      {#if editingBrewer !== 'new'}
        <button onclick={() => hide('brewer', editingBrewer!, brewerForm.name)}>Hide</button>
      {/if}
      <button onclick={() => (editingBrewer = null)}>Cancel</button>
      <button class="primary" onclick={submitBrewer} disabled={!brewerForm.name.trim()}>Save</button>
    </div>
  </div>
{/snippet}

{#snippet grinderEditor()}
  <div class="card stack">
    <input type="text" bind:value={grinderForm.name} placeholder="Name, e.g. Comandante C40" aria-label="Grinder name" />
    <input type="text" bind:value={grinderForm.setting_hint} placeholder="How settings look, e.g. 22 clicks or 2.3.1" aria-label="Setting format" />
    <div class="row">
      {#if editingGrinder !== 'new'}
        <button onclick={() => hide('grinder', editingGrinder!, grinderForm.name)}>Hide</button>
      {/if}
      <button onclick={() => (editingGrinder = null)}>Cancel</button>
      <button class="primary" onclick={submitGrinder} disabled={!grinderForm.name.trim()}>Save</button>
    </div>
  </div>
{/snippet}

<style>
  .hidden-item {
    gap: 12px;
  }
  .hidden-item .text {
    flex: 1;
  }
  .hidden-item button {
    flex: none;
  }
  .equipment {
    max-width: 680px;
    padding-bottom: 24px;
  }
  .back {
    color: var(--accent);
    text-decoration: none;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    text-align: left;
    min-height: 72px;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .small {
    font-size: 13px;
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
  .chip.on,
  .art.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .art-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 8px;
  }
  .art {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 4px;
    height: auto;
    text-align: center;
  }
  .row button {
    flex: 1;
  }
  .danger {
    color: var(--danger);
  }
</style>
