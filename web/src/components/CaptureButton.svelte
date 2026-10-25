<script lang="ts">
  import { MAX_PHOTOS_PER_BAG, createBagWithPhotos } from '../lib/actions'
  import { DEFAULT_NEW_BAG_STATE, NEW_BAG_SETTING, type NewBagState } from '../lib/domain/inventory'
  import { device } from '../lib/state/device.svelte'
  import { settingValue } from '../lib/state/live.svelte'
  import { navigate } from '../lib/state/router.svelte'
  import { showToast } from '../lib/state/toast.svelte'

  let busy = $state(false)

  // Each label is the user gesture that opens the camera / the photo library directly
  async function onchange(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const files = [...(input.files ?? [])]
    input.value = ''
    if (!files.length) return
    busy = true
    try {
      const frozen = settingValue<NewBagState>(NEW_BAG_SETTING, DEFAULT_NEW_BAG_STATE) === 'frozen'
      const bagId = await createBagWithPhotos(files, { frozen, userId: device.userId })
      if (files.length > MAX_PHOTOS_PER_BAG) showToast(`One bag keeps up to ${MAX_PHOTOS_PER_BAG} photos — the first ${MAX_PHOTOS_PER_BAG} were added`)
      navigate(`/capture/${bagId}`)
    } finally {
      busy = false
    }
  }
</script>

<div class="capture" aria-busy={busy}>
  <label class="library">
    <input type="file" accept="image/*" multiple {onchange} aria-label="Choose photos of a new bag" />
    From photos
  </label>
  <label class="snap">
    <input type="file" accept="image/*" capture="environment" {onchange} aria-label="Photograph a new bag" />
    {busy ? 'Saving…' : '+ Snap a bag'}
  </label>
</div>

<style>
  .capture {
    display: flex;
    gap: 8px;
  }
  label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--tap);
    padding: 0 16px;
    border-radius: var(--radius);
    font-weight: 600;
    cursor: pointer;
  }
  .snap {
    background: var(--accent);
    color: var(--accent-text);
  }
  .library {
    border: 1px solid var(--border);
    background: var(--surface);
  }
  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
</style>
