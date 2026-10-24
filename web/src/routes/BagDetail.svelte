<script lang="ts">
  import BagActions from '../components/BagActions.svelte'
  import FreshnessBar from '../components/FreshnessBar.svelte'
  import Photo from '../components/Photo.svelte'
  import ReviewForm from '../components/ReviewForm.svelte'
  import { MAX_PHOTOS_PER_BAG, addPhoto, deleteBagLater } from '../lib/actions'
  import { flavorTag } from '../lib/domain/flavors'
  import { inventory } from '../lib/state/inventory.svelte'
  import { bags } from '../lib/state/live.svelte'
  import { href, navigate, route } from '../lib/state/router.svelte'
  import { showToast } from '../lib/state/toast.svelte'

  const id = $derived(route.path.split('/')[2] ?? '')
  const view = $derived(inventory.byId.get(id))
  let editing = $state(false)
  let zoomed = $state<string | null>(null)

  async function onAddPhoto(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (file && view) await addPhoto(view.id, file, view.photoIds.length)
  }

  function del() {
    if (!view) return
    const undo = deleteBagLater(view.id, inventory.setHidden)
    showToast('Bag deleted', undo)
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

{#if !view}
  <p class="muted">{bags.loaded ? 'This bag doesn’t exist (anymore).' : 'Loading…'}</p>
{:else}
  <div class="stack detail">
    <a class="back" href={href('/inventory')} onclick={(e) => { e.preventDefault(); history.length > 1 ? history.back() : navigate('/inventory') }}>‹ Inventory</a>

    <div class="photos">
      {#each view.photoIds as pid (pid)}
        <button class="photo" onclick={() => (zoomed = zoomed === pid ? null : pid)} aria-label="Show photo larger">
          <Photo id={pid} size="thumb" />
        </button>
      {/each}
      {#if view.photoIds.length < MAX_PHOTOS_PER_BAG}
        <label class="photo add">
          <input type="file" accept="image/*" capture="environment" onchange={onAddPhoto} aria-label="Add a photo" />
          + Photo
        </label>
      {/if}
    </div>
    {#if zoomed}
      <button class="zoom" onclick={() => (zoomed = null)} aria-label="Close photo"><Photo id={zoomed} size="full" /></button>
    {/if}

    {#if view.needsReview || editing}
      {#key view.id}<ReviewForm {view} onsaved={() => (editing = false)} />{/key}
    {:else}
      <div class="titles">
        {#if view.roasterName}<span class="roaster">{view.roasterName}</span>{/if}
        <h1>{view.title}</h1>
      </div>
      <FreshnessBar {view} rest={inventory.rest} />
      {#if view.gramsLeft != null}
        <p class="amount">{view.lastCup ? 'Last cup' : `~${view.cupsLeft} cups`} · {Math.round(view.gramsLeft)} g left</p>
      {/if}
      {#if view.state !== 'finished'}
        <a class="brew-link" href={href(`/brew/${view.id}`)}>Brew this</a>
      {/if}
      <BagActions {view} />

      {#if view.flavorTags.length}
        <div class="tags">
          {#each view.flavorTags as t (t)}<span class="tag">{flavorTag(t)?.label ?? t}</span>{/each}
        </div>
      {/if}
      <dl>
        {#each details as [k, v] (k)}<dt>{k}</dt><dd>{v}</dd>{/each}
      </dl>
      <button onclick={() => (editing = true)}>Edit details</button>
    {/if}

    <button class="danger" onclick={del}>Delete bag</button>
  </div>
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
  .brew-link {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 56px;
    border-radius: var(--radius);
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 700;
    text-decoration: none;
  }
</style>
