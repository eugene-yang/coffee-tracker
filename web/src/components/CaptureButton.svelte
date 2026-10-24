<script lang="ts">
  import { createBagWithPhoto } from '../lib/actions'
  import { navigate } from '../lib/state/router.svelte'

  let busy = $state(false)

  // The label is the user gesture that opens the camera directly
  async function onchange(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    busy = true
    try {
      const bagId = await createBagWithPhoto(file)
      navigate(`/capture/${bagId}`)
    } finally {
      busy = false
    }
  }
</script>

<label class="snap" aria-busy={busy}>
  <input type="file" accept="image/*" capture="environment" {onchange} aria-label="Photograph a new bag" />
  {busy ? 'Saving…' : '+ Snap a bag'}
</label>

<style>
  .snap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--tap);
    padding: 0 16px;
    border-radius: var(--radius);
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
    cursor: pointer;
  }
  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
</style>
