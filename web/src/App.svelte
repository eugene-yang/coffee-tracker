<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte'
  import PhoneShell from './layouts/PhoneShell.svelte'
  import StationShell from './layouts/StationShell.svelte'
  import Home from './routes/Home.svelte'
  import Inventory from './routes/Inventory.svelte'
  import BagDetail from './routes/BagDetail.svelte'
  import Capture from './routes/Capture.svelte'
  import Toast from './components/Toast.svelte'
  import StorageFull from './components/StorageFull.svelte'
  import Tastings from './routes/Tastings.svelte'
  import Settings from './routes/Settings.svelte'
  import Equipment from './routes/Equipment.svelte'
  import BrewScreen from './routes/BrewScreen.svelte'
  import Rate from './routes/Rate.svelte'
  import { currentLayout } from './lib/state/device.svelte'
  import { replace, route } from './lib/state/router.svelte'

  // Registers the service worker; autoUpdate swaps in new versions on next load
  useRegisterSW({ immediate: true })

  const layout = $derived(currentLayout())
  const section = $derived(route.path.split('/')[1] || 'home')

  // The Brew tab is gone: brews start from a bag or Brew again; old /brew links land on Home
  $effect(() => {
    if (route.path.replace(/\/$/, '') === '/brew') replace('/')
  })
</script>

{#snippet page()}
  {#if route.path.startsWith('/settings/equipment')}
    <Equipment />
  {:else if section === 'settings'}
    <Settings />
  {:else if section === 'bag'}
    <BagDetail />
  {:else if section === 'capture'}
    <Capture />
  {:else if section === 'rate'}
    <Rate />
  {:else if section === 'brew' && route.path.split('/')[2]}
    <BrewScreen />
  {:else if section === 'tastings'}
    <Tastings />
  {:else if section === 'inventory' || (section === 'home' && layout === 'station')}
    <Inventory />
  {:else}
    <Home />
  {/if}
{/snippet}

{#if layout === 'station'}
  <StationShell>{@render page()}</StationShell>
{:else}
  <PhoneShell section={section === 'bag' || section === 'capture' ? 'inventory' : section === 'rate' ? 'home' : section}>{@render page()}</PhoneShell>
{/if}
<Toast />
<StorageFull />
