<script lang="ts">
  import { currentLayout } from '../lib/state/device.svelte'
</script>

<div class="empty card stack">
  <strong>No beans yet</strong>
  <p class="muted">
    {currentLayout() === 'station' ? 'Add bags from your phone.' : 'Bag capture arrives in the next milestone.'}
  </p>
</div>

<style>
  .empty {
    text-align: center;
    padding: 32px 16px;
  }
  p {
    margin: 0;
  }
</style>
