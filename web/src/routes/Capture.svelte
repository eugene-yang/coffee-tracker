<script lang="ts">
  // After the first photo: add up to two more (back, sticker), then review
  import Photo from '../components/Photo.svelte'
  import { MAX_PHOTOS_PER_BAG, addPhoto } from '../lib/actions'
  import { inventory } from '../lib/state/inventory.svelte'
  import { replace, route } from '../lib/state/router.svelte'

  const bagId = $derived(route.path.split('/')[2] ?? '')
  const view = $derived(inventory.byId.get(bagId))
  let busy = $state(false)

  async function onchange(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const files = [...(input.files ?? [])]
    input.value = ''
    if (!files.length || !view) return
    busy = true
    try {
      const room = MAX_PHOTOS_PER_BAG - view.photoIds.length
      for (const [i, file] of files.slice(0, room).entries()) await addPhoto(bagId, file, view.photoIds.length + i)
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
    <div class="adds" aria-busy={busy}>
      <label class="add">
        <input type="file" accept="image/*" capture="environment" {onchange} aria-label="Add another photo" />
        {busy ? 'Saving…' : 'Add another'}
      </label>
      <label class="add">
        <input type="file" accept="image/*" multiple {onchange} aria-label="Add from photos" />
        From photos
      </label>
    </div>
  {/if}
  <button class="primary done" onclick={() => replace(`/bag/${bagId}/review`)}>Done</button>
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
  .adds {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 8px;
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
