<script lang="ts">
  import { createBags } from '../lib/actions'
  import { DEFAULT_NEW_BAG_STATE, NEW_BAG_SETTING, type NewBagState } from '../lib/domain/inventory'
  import { device } from '../lib/state/device.svelte'
  import { settingValue } from '../lib/state/live.svelte'
  import { navigate } from '../lib/state/router.svelte'
  import { showToast } from '../lib/state/toast.svelte'

  let busy = $state(false)

  // One button: iOS offers Photo Library · Take Photo · Choose Files from the same picker.
  // One photo → add its back / sticker next; several → one bag each, reviewed from Needs review.
  async function onchange(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const files = [...(input.files ?? [])]
    input.value = ''
    if (!files.length) return
    busy = true
    try {
      const frozen = settingValue<NewBagState>(NEW_BAG_SETTING, DEFAULT_NEW_BAG_STATE) === 'frozen'
      const ids = await createBags(files, { frozen, userId: device.userId })
      if (ids.length === 1) navigate(`/capture/${ids[0]}`)
      else showToast(`Added ${ids.length} bags — review them under Needs review`)
    } finally {
      busy = false
    }
  }
</script>

<label class="capture" aria-busy={busy}>
  <input type="file" accept="image/*" multiple {onchange} aria-label="Add bags from photos" />
  {busy ? 'Saving…' : '+ Add bags'}
</label>

<style>
  .capture {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--tap);
    padding: 0 16px;
    border-radius: var(--radius);
    font-weight: 600;
    cursor: pointer;
    background: var(--accent);
    color: var(--accent-text);
  }
  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
</style>
