<script lang="ts">
  import { dismissToast, toast } from '../lib/state/toast.svelte'
</script>

{#if toast.message}
  <div class="toast" role="status">
    <span>{toast.message}</span>
    {#if toast.undo}
      <button
        onclick={() => {
          toast.undo?.()
          dismissToast()
        }}>Undo</button
      >
    {/if}
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(80px + var(--bottom-inset));
    transform: translateX(-50%);
    width: max-content; /* centered with left: 50%, it would otherwise wrap at half the screen */
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 8px 8px 20px;
    border-radius: var(--radius);
    background: var(--text);
    color: var(--bg);
    max-width: calc(100vw - 32px);
  }
  .toast button {
    min-width: var(--tap);
    background: transparent;
    color: var(--accent);
    border: none;
    font-weight: 700;
  }
</style>
