<script lang="ts">
  // Station: one person's rating, their name large so the right person rates. Closes 1.5 s after a star.
  import { onDestroy } from 'svelte'
  import Avatar from './Avatar.svelte'
  import Stars from './Stars.svelte'
  import TempChip from './TempChip.svelte'
  import { methodLabel } from '../lib/domain/brew'
  import type { PendingTasting } from '../lib/domain/tasting'
  import { inventory } from '../lib/state/inventory.svelte'
  import { users } from '../lib/state/live.svelte'
  import { navigate } from '../lib/state/router.svelte'
  import { rateLink, ratedToast, tastingState } from '../lib/state/tastings.svelte'

  let { p, onclose }: { p: PendingTasting; onclose: () => void } = $props()

  const user = $derived(users.get(p.userId))
  const title = $derived(inventory.byId.get(p.brew.bag_id)?.title ?? 'Bag')

  let closing: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(closing))

  async function rate(n: number) {
    const { undo } = await tastingState.rate(p, n)
    ratedToast(user?.name ?? '', n, undo)
    clearTimeout(closing)
    closing = setTimeout(onclose, 1500)
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="sheet" role="dialog" aria-modal="true" aria-label="{user?.name}'s rating" tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <div class="who">
      <Avatar {user} size={64} />
      <span class="name">{user?.name ?? '?'}</span>
      <button class="close" aria-label="Close" onclick={onclose}>✕</button>
    </div>
    <p class="muted">{title} · {methodLabel(p.brew.method)}</p>
    <div class="row">
      <TempChip band={tastingState.bandOf(p)} minutes={p.minutes} now={p.state === 'again'} oncycle={() => tastingState.cycleBand(p)} />
    </div>
    <Stars value={p.state === 'editing' ? p.last?.overall : null} size={72} label="{user?.name}'s stars" onrate={rate} />
    <button class="detail" onclick={() => navigate(rateLink(p))}>More detail</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 15;
    background: rgb(0 0 0 / 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sheet {
    width: min(520px, calc(100vw - 32px));
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px 24px 24px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .name {
    flex: 1;
    font-size: 32px;
    font-weight: 700;
  }
  .close {
    width: 56px;
    min-height: 56px;
    padding: 0;
    border: none;
    background: transparent;
  }
  p {
    margin: 0;
  }
  .detail {
    min-height: 56px;
  }
</style>
