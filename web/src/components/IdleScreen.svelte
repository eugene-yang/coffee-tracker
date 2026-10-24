<script lang="ts">
  // Station attract screen after 2 minutes idle: clock + current brewer. The first tap only wakes it.
  import { onDestroy, onMount } from 'svelte'
  import Avatar from './Avatar.svelte'
  import { brewState } from '../lib/state/brew.svelte'
  import { device } from '../lib/state/device.svelte'
  import { users } from '../lib/state/live.svelte'

  let { idleMs = 120_000 }: { idleMs?: number } = $props()

  let idle = $state(false)
  let clock = $state(new Date())
  let last = Date.now()
  let timer: ReturnType<typeof setInterval> | undefined

  const brewer = $derived(users.get(device.userId))

  function activity() {
    last = Date.now()
  }

  onMount(() => {
    window.addEventListener('pointerdown', activity, true)
    window.addEventListener('keydown', activity, true)
    timer = setInterval(() => {
      clock = new Date()
      // Never cover a running timer
      if (!idle && Date.now() - last > idleMs && brewState.draft?.phase !== 'running') idle = true
    }, 1000)
  })
  onDestroy(() => {
    window.removeEventListener('pointerdown', activity, true)
    window.removeEventListener('keydown', activity, true)
    clearInterval(timer)
  })

  // Dismiss on click (not pointerdown) so the tap is consumed here and never reaches what's underneath
  function wake(e: Event) {
    e.preventDefault()
    e.stopPropagation()
    idle = false
    last = Date.now()
  }
</script>

{#if idle}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="idle" role="button" tabindex="0" aria-label="Tap to start" onpointerdown={(e) => e.stopPropagation()} onclick={wake} onkeydown={wake}>
    <div class="time">{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    <div class="who">
      <Avatar user={brewer} size={72} />
      <span>{brewer?.name ?? "Who's brewing?"}</span>
    </div>
    <div class="hint">Tap to start</div>
  </div>
{/if}

<style>
  .idle {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    background: #0b0b0b;
    color: #bdbdbd;
  }
  .time {
    font-size: 128px;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 28px;
  }
  .hint {
    color: #777;
    font-size: 20px;
  }
</style>
