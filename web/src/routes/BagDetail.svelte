<script lang="ts">
  // A bag: brew it first, then its state, its whole brew + rating history and the label details.
  // Editing the details (or reviewing a new bag's label) is a separate step.
  import BagActions from '../components/BagActions.svelte'
  import BagHistory from '../components/BagHistory.svelte'
  import ConfirmDialog from '../components/ConfirmDialog.svelte'
  import FreshnessBar from '../components/FreshnessBar.svelte'
  import Photo from '../components/Photo.svelte'
  import ReviewForm from '../components/ReviewForm.svelte'
  import { MAX_PHOTOS_PER_BAG, addPhoto } from '../lib/actions'
  import { cascadeSentence } from '../lib/domain/deletes'
  import { bagDeletion, deleteWithUndo } from '../lib/state/deletes.svelte'
  import { brewAgainSource, brewerLabel, paramSummary, paramsOf } from '../lib/domain/brew'
  import { flavorTag } from '../lib/domain/flavors'
  import { brewState } from '../lib/state/brew.svelte'
  import { device } from '../lib/state/device.svelte'
  import { inventory } from '../lib/state/inventory.svelte'
  import { bags, brewers, brews } from '../lib/state/live.svelte'
  import { href, navigate, replace, route } from '../lib/state/router.svelte'

  const id = $derived(route.path.split('/')[2] ?? '')
  const view = $derived(inventory.byId.get(id))
  // /bag/:id/review — straight from capture: open the label form
  let editing = $state(route.path.split('/')[3] === 'review')
  function closeEdit() {
    editing = false
    if (route.path.endsWith('/review')) replace(`/bag/${id}`)
  }
  let zoomed = $state<string | null>(null)
  const again = $derived(view ? brewAgainSource(brews.rows, view.id, device.userId) : undefined)

  function brew() {
    if (!view) return
    brewState.prepare(view.id, device.userId, again ? { brewerId: again.brewer_id, method: again.method } : {})
    navigate(`/brew/${view.id}`)
  }

  async function onAddPhoto(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (file && view) await addPhoto(view.id, file, view.photoIds.length)
  }

  let confirming = $state(false)
  const cascade = $derived(confirming && view ? bagDeletion(view.id) : null)

  function del() {
    if (!view || !cascade) return
    // A brew of this bag still being set up or timed goes with it (and comes back with Undo)
    const draft = brewState.draft?.bagId === view.id ? $state.snapshot(brewState.draft) : null
    if (draft) brewState.discard()
    deleteWithUndo(`${view.title} deleted`, cascade.rows, () => draft && brewState.restore(draft))
    confirming = false
    navigate('/inventory')
  }

  const details = $derived(
    view?.coffee
      ? ([
          ['Origin', view.coffee.origin],
          ['Producer', view.coffee.producer],
          ['Variety', view.coffee.variety],
          ['Process', view.coffee.process],
          ['Roast', view.coffee.roast_level],
          ['Altitude', view.coffee.altitude],
          ['Roast date', view.bag.roast_date],
          ['Roaster notes', (view.coffee.tasting_notes ?? []).join(', ')],
          ['Notes', view.coffee.notes],
        ].filter(([, v]) => v) as [string, string][])
      : [],
  )
</script>

{#snippet photos()}
  {#if view}
    <div class="photos">
      {#each view.photoIds as pid (pid)}
        <button class="photo" onclick={() => (zoomed = zoomed === pid ? null : pid)} aria-label="Show photo larger">
          <Photo id={pid} size="thumb" />
        </button>
      {/each}
      {#if view.photoIds.length < MAX_PHOTOS_PER_BAG}
        <label class="photo add">
          <input type="file" accept="image/*" onchange={onAddPhoto} aria-label="Add a photo" />
          + Photo
        </label>
      {/if}
    </div>
    {#if zoomed}
      <button class="zoom" onclick={() => (zoomed = null)} aria-label="Close photo"><Photo id={zoomed} size="full" /></button>
    {/if}
  {/if}
{/snippet}

{#if !view}
  <p class="muted">{bags.loaded ? 'This bag doesn’t exist (anymore).' : 'Loading…'}</p>
{:else}
  <div class="stack detail">
    <a class="back" href={href('/inventory')} onclick={(e) => { e.preventDefault(); history.length > 1 ? history.back() : navigate('/inventory') }}>‹ Inventory</a>

    {#if editing}
      <div class="row edit-head">
        <h1>{view.needsReview ? 'Review label' : 'Edit details'}</h1>
        <button class="cancel" onclick={closeEdit}>Cancel</button>
      </div>
      {@render photos()}
      {#key view.id}<ReviewForm {view} onsaved={closeEdit} />{/key}
    {:else}
      <div class="titles">
        {#if view.roasterName}<span class="roaster">{view.roasterName}</span>{/if}
        <h1>{view.title}</h1>
      </div>
      {#if view.needsReview}
        <button class="card review" onclick={() => (editing = true)}>
          <strong>Label details need a check</strong>
          <span class="muted">Brewable already — review when you have a minute ›</span>
        </button>
      {/if}
      {#if view.state !== 'finished'}
        <button class="primary brew" onclick={brew}>
          {again ? 'Brew again' : 'Brew'}
          {#if again}<small>{brewerLabel(again, brewers.rows)} · {paramSummary(paramsOf(again))}</small>{/if}
        </button>
      {/if}
      <FreshnessBar {view} rest={inventory.rest} />
      {#if view.gramsLeft != null}
        <p class="amount">{view.lastCup ? 'Last cup' : `~${view.cupsLeft} cups`} · {Math.round(view.gramsLeft)} g left</p>
      {/if}
      <BagActions {view} />

      <BagHistory bagId={view.id} />

      <section class="stack">
        <div class="row details-head">
          <h2>Details</h2>
          <button onclick={() => (editing = true)}>Edit</button>
        </div>
        {@render photos()}
        {#if view.flavorTags.length}
          <div class="tags">
            {#each view.flavorTags as t (t)}<span class="tag">{flavorTag(t)?.label ?? t}</span>{/each}
          </div>
        {/if}
        {#if details.length}
          <dl>
            {#each details as [k, v] (k)}<dt>{k}</dt><dd>{v}</dd>{/each}
          </dl>
        {/if}
      </section>
    {/if}

    <button class="danger" onclick={() => (confirming = true)}>Delete bag</button>
  </div>
  {#if cascade}
    <ConfirmDialog
      title="Delete {view.title}?"
      message={[cascadeSentence(cascade, 'bag'), brewState.draft?.bagId === view.id ? 'The brew in progress is discarded.' : ''].filter(Boolean).join(' ')}
      onconfirm={del}
      oncancel={() => (confirming = false)}
    />
  {/if}
{/if}

<style>
  .detail {
    padding-bottom: 24px;
  }
  .back {
    color: var(--accent);
    text-decoration: none;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
  }
  .photos {
    display: flex;
    gap: 8px;
  }
  .photo {
    width: 96px;
    height: 96px;
    padding: 0;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid var(--border);
    flex: none;
  }
  .add {
    display: flex;
    align-items: center;
    justify-content: center;
    border-style: dashed;
    color: var(--text-muted);
    cursor: pointer;
  }
  .add input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  .zoom {
    padding: 0;
    border: none;
    height: auto;
    border-radius: var(--radius);
    overflow: hidden;
  }
  .zoom :global(img) {
    height: auto;
    max-height: 70dvh;
    object-fit: contain;
  }
  .titles {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .roaster {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  h1 {
    font-size: 24px;
  }
  .amount {
    margin: 0;
    font-weight: 600;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tag {
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 14px;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    margin: 0;
  }
  dt {
    color: var(--text-muted);
  }
  dd {
    margin: 0;
  }
  .danger {
    color: var(--danger);
    margin-top: 16px;
  }
  .brew {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 64px;
    font-size: 18px;
    font-weight: 700;
  }
  .brew small {
    font-size: 14px;
    font-weight: 500;
  }
  .review {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
    border-color: var(--warn);
  }
  .review .muted {
    font-size: 14px;
  }
  .edit-head,
  .details-head {
    justify-content: space-between;
  }
  .cancel {
    min-height: 40px;
  }
</style>
