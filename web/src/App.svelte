<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte'
  import PhoneShell from './layouts/PhoneShell.svelte'
  import StationShell from './layouts/StationShell.svelte'
  import Home from './routes/Home.svelte'
  import Inventory from './routes/Inventory.svelte'
  import Brew from './routes/Brew.svelte'
  import Settings from './routes/Settings.svelte'
  import { currentLayout } from './lib/state/device.svelte'
  import { route } from './lib/state/router.svelte'

  // Registers the service worker; autoUpdate swaps in new versions on next load
  useRegisterSW({ immediate: true })

  const layout = $derived(currentLayout())
  const section = $derived(route.path.split('/')[1] || 'home')
</script>

{#snippet page()}
  {#if section === 'settings'}
    <Settings />
  {:else if section === 'brew'}
    <Brew />
  {:else if section === 'inventory' || (section === 'home' && layout === 'station')}
    <Inventory />
  {:else}
    <Home />
  {/if}
{/snippet}

{#if layout === 'station'}
  <StationShell>{@render page()}</StationShell>
{:else}
  <PhoneShell {section}>{@render page()}</PhoneShell>
{/if}
