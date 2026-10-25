<script lang="ts">
  // The only blocking dialog in the app: this device has no room left for new data
  import { onStorageFull } from '../lib/db/local'

  let open = $state(false)
  onStorageFull(() => (open = true))
</script>

{#if open}
  <div class="backdrop">
    <div class="dialog card stack" role="alertdialog" aria-modal="true" aria-labelledby="storage-full-title">
      <strong id="storage-full-title">This device is out of storage</strong>
      <p>Your last change couldn’t be saved here. Everything saved before it is safe and syncs as usual.</p>
      <p class="muted">Free up some space (old photos, unused apps), then try again.</p>
      <button class="primary" onclick={() => (open = false)}>OK</button>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0 0 calc(0px - var(--viewport-gap));
    z-index: 40;
    background: rgb(0 0 0 / 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .dialog {
    max-width: 420px;
  }
  p {
    margin: 0;
  }
</style>
