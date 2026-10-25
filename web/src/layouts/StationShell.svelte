<script lang="ts">
  import type { Snippet } from 'svelte'
  import Avatar from '../components/Avatar.svelte'
  import SyncDot from '../components/SyncDot.svelte'
  import IdleScreen from '../components/IdleScreen.svelte'
  import ResumeBrew from '../components/ResumeBrew.svelte'
  import { device, setDeviceUser } from '../lib/state/device.svelte'
  import { users } from '../lib/state/live.svelte'
  import { href, route } from '../lib/state/router.svelte'

  let { children }: { children: Snippet } = $props()

  // "Who's brewing" is sticky: the station remembers the last brewer
  let picking = $state(false)
  const brewer = $derived(users.get(device.userId))
  const inSettings = $derived(route.path.startsWith('/settings'))
</script>

<div class="station">
  <header>
    <button class="brewer" onclick={() => (picking = !picking)} aria-expanded={picking}>
      <Avatar user={brewer} size={40} />
      <span>{brewer?.name ?? "Who's brewing?"}</span>
    </button>
    <nav>
      <a href={href('/')} class:active={!inSettings}>Inventory</a>
      <a href={href('/settings')} class:active={inSettings}>Settings</a>
    </nav>
    <SyncDot />
  </header>

  {#if picking}
    <div class="picker" role="dialog" aria-label="Who's brewing?">
      {#each users.rows as user (user.id)}
        <button
          class:selected={user.id === device.userId}
          onclick={() => {
            setDeviceUser(user.id)
            picking = false
          }}
        >
          <Avatar {user} size={48} />
          <span>{user.name}</span>
        </button>
      {:else}
        <p class="muted">No users yet — add people in Settings.</p>
      {/each}
    </div>
  {/if}

  <ResumeBrew />
  <main>{@render children()}</main>
  <IdleScreen />
</div>

<style>
  .station {
    min-height: 100dvh;
    background: var(--bg);
    color: var(--text);
    padding: 0 16px;
  }
  header {
    height: 56px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .brewer {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    border: none;
    background: transparent;
    padding: 0 8px 0 0;
    font-weight: 600;
  }
  nav {
    flex: 1;
    display: flex;
    gap: 8px;
  }
  nav a {
    display: inline-flex;
    align-items: center;
    min-height: 56px;
    padding: 0 16px;
    color: var(--text-muted);
    text-decoration: none;
    font-weight: 600;
  }
  nav a.active {
    color: var(--text);
  }
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 0;
  }
  .picker button {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 200px;
    min-height: 72px;
  }
  .picker button.selected {
    border-color: var(--accent);
  }
  main {
    padding: 8px 0 16px;
  }
</style>
