<script lang="ts">
  // After the first photo: add up to two more (back, sticker), then review
  import Photo from '../components/Photo.svelte'
  import { MAX_PHOTOS_PER_BAG, addPhoto } from '../lib/actions'
  import { inventory } from '../lib/state/inventory.svelte'
  import { navigate, route } from '../lib/state/router.svelte'

  const bagId = $derived(route.path.split('/')[2] ?? '')
  const view = $derived(inventory.byId.get(bagId))
  let busy = $state(false)

  async function onchange(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || !view) return
    busy = true
    try {
      await addPhoto(bagId, file, view.photoIds.length)
    } finally {
      busy = false
    }
  }
</script>

<div class="capture stack">
  <p class="muted">Saved. Add the back or the roast-date sticker so the label reader sees everything.</p>
  <div class="shots">
    {#each view?.photoIds ?? [] as pid (pid)}
      <span class="shot"><Photo id={pid} /></span>
    {/each}
  </div>
  {#if (view?.photoIds.length ?? 0) < MAX_PHOTOS_PER_BAG}
    <label class="add" aria-busy={busy}>
      <input type="file" accept="image/*" capture="environment" {onchange} aria-label="Add another photo" />
      {busy ? 'Saving…' : 'Add another'}
    </label>
  {/if}
  <button class="primary done" onclick={() => navigate(`/bag/${bagId}`)}>Done</button>
</div>

<style>
  .shots {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .shot {
    aspect-ratio: 1;
    border-radius: 10px;
    overflow: hidden;
  }
  .add {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 56px;
    border-radius: var(--radius);
    border: 1px dashed var(--border);
    cursor: pointer;
  }
  .add input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  .done {
    min-height: 56px;
    font-weight: 700;
  }
</style>
