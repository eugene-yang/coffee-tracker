<script lang="ts">
  // "Delete …?" with what goes with it spelled out; the destructive button is never the default
  let {
    title,
    message = '',
    confirm = 'Delete',
    onconfirm,
    oncancel,
  }: { title: string; message?: string; confirm?: string; onconfirm: () => void; oncancel: () => void } = $props()
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={oncancel}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog card" role="alertdialog" aria-modal="true" aria-label={title} tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <strong>{title}</strong>
    {#if message}<p class="muted">{message}</p>{/if}
    <div class="actions">
      <button onclick={oncancel}>Cancel</button>
      <button class="danger" onclick={onconfirm}>{confirm}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgb(0 0 0 / 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .dialog {
    width: min(420px, 100%);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  p {
    margin: 0;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .danger {
    background: var(--danger);
    border-color: var(--danger);
    color: #fff;
    font-weight: 700;
  }
</style>
