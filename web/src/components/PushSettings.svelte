<script lang="ts">
  // Settings → Notifications: "How's the cup?" on this device, and how long after brewing it comes
  import { onMount } from 'svelte'
  import { mutate } from '../lib/db/local'
  import { currentSubscription, disablePush, enablePush, pushSupport, sendTestPush } from '../lib/push'
  import { device } from '../lib/state/device.svelte'
  import { settingValue, users } from '../lib/state/live.svelte'

  const DELAY_SETTING = 'push_delay_min' // same key as server/app/push.py
  const delay = $derived(settingValue<number>(DELAY_SETTING, 5))
  const me = $derived(users.get(device.userId))

  const support = pushSupport()
  let on = $state(false)
  let denied = $state(support === 'ok' && Notification.permission === 'denied')
  let busy = $state(false)
  let message = $state('')

  onMount(async () => {
    on = !!(await currentSubscription().catch(() => null)) && Notification.permission === 'granted'
  })

  async function run(fn: () => Promise<void>, done: string) {
    busy = true
    message = ''
    try {
      await fn()
      message = done
    } catch (e) {
      message = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
      if (support === 'ok') denied = Notification.permission === 'denied'
    }
  }

  const turnOn = () =>
    run(async () => {
      await enablePush(device.userId!)
      on = true
    }, '')
  const turnOff = () =>
    run(async () => {
      await disablePush()
      on = false
    }, '')
  const test = () => run(sendTestPush, 'Test sent — it should arrive in a few seconds.')

  function stepDelay(d: number) {
    mutate('setting', DELAY_SETTING, { value: Math.min(60, Math.max(1, delay + d)) })
  }
</script>

<div class="card stack">
  {#if support === 'needs-install'}
    <span>On iPhone and iPad, notifications only work in the installed app: Share → Add to Home Screen, then open it from there.</span>
  {:else if support === 'unsupported'}
    <span class="muted">This browser can’t show notifications.</span>
  {:else if denied}
    <span>Notifications are blocked for this app. Allow them in the system settings, then come back here.</span>
  {:else if !me}
    <span class="muted">Pick who uses this device first.</span>
  {:else if on}
    <span>On for {me.name} on this device.</span>
    <div class="row">
      <button disabled={busy} onclick={test}>Send a test</button>
      <button disabled={busy} onclick={turnOff}>Turn off</button>
    </div>
  {:else}
    <span class="muted">A reminder a few minutes after a brew you’re drinking, if you haven’t rated it yet.</span>
    <button class="primary" disabled={busy} onclick={turnOn}>Turn on “How’s the cup?”</button>
  {/if}
  {#if message}<span class="muted" role="status">{message}</span>{/if}

  <div class="row stepper">
    <span class="label">Remind after</span>
    <button aria-label="Remind sooner" onclick={() => stepDelay(-1)}>−</button>
    <span class="value">{delay} min</span>
    <button aria-label="Remind later" onclick={() => stepDelay(1)}>+</button>
  </div>
  <span class="muted">For everyone. Cups that reach the server more than two hours late (brewed offline) don’t send one.</span>
</div>

<style>
  .stepper .label {
    flex: 1;
  }
  .stepper button {
    width: var(--tap);
    padding: 0;
    font-size: 22px;
  }
  .stepper .value {
    min-width: 72px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .row button:not(.stepper button) {
    flex: 1;
  }
</style>
