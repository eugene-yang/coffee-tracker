<script lang="ts">
  import MethodIcon from './MethodIcon.svelte'
  import { paramSummary, paramsOf, type Shortcut } from '../lib/domain/brew'
  import { brewState } from '../lib/state/brew.svelte'
  import { device } from '../lib/state/device.svelte'
  import { inventory } from '../lib/state/inventory.svelte'
  import { navigate } from '../lib/state/router.svelte'

  let { shortcut, compact = false }: { shortcut: Shortcut; compact?: boolean } = $props()

  const view = $derived(inventory.byId.get(shortcut.bagId))

  function go() {
    brewState.prepare(shortcut.bagId, device.userId, { brewerId: shortcut.brew.brewer_id, method: shortcut.brew.method })
    navigate(`/brew/${shortcut.bagId}`)
  }
</script>

<button class="shortcut" class:compact onclick={go} aria-label="Brew again: {view?.title}">
  <span class="again" aria-hidden="true">↻</span>
  <MethodIcon method={shortcut.brew.method} size={22} />
  <span class="text">
    <strong>{view?.title ?? 'Bag'}</strong>
    <span class="muted">{paramSummary(paramsOf(shortcut.brew))}</span>
  </span>
</button>

<style>
  .shortcut {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--tap);
    padding: 8px 14px;
    text-align: left;
    min-width: 0;
  }
  .again {
    font-size: 20px;
    color: var(--accent);
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .text > * {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .muted {
    font-size: 14px;
  }
  .compact {
    flex: 1 1 0;
  }
</style>
