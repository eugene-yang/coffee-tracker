<script lang="ts">
  import { syncNow, syncState } from '../lib/state/sync.svelte'

  const label = $derived(
    syncState.status === 'preview'
      ? 'Preview · data stays on this device'
      : syncState.status === 'offline'
      ? syncState.pending > 0
        ? `Saved on this device · ${syncState.pending} to sync`
        : 'Server unreachable'
      : syncState.status === 'syncing'
        ? 'Syncing…'
        : syncState.pending > 0
          ? `${syncState.pending} to sync`
          : 'Synced',
  )
</script>

<button class="sync {syncState.status}" title={label} aria-label={label} onclick={() => syncNow()}>
  <span class="dot"></span>
  {#if syncState.status === 'preview'}
    <span class="text">Preview</span>
  {:else if syncState.status === 'offline'}
    <span class="text">{syncState.pending > 0 ? `Saved here · ${syncState.pending}` : 'Offline'}</span>
  {:else if syncState.pending > 0}
    <span class="text">{syncState.pending}</span>
  {/if}
</button>

<style>
  .sync {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: none;
    background: transparent;
    padding: 0 8px;
    color: var(--text-muted);
    font-size: 14px;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--ok);
  }
  .pending .dot,
  .syncing .dot {
    background: var(--warn);
  }
  .preview .dot {
    background: var(--accent);
  }
  .offline .dot {
    background: transparent;
    border: 2px solid var(--off);
  }
</style>
