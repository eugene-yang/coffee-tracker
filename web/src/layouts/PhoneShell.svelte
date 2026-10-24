<script lang="ts">
  import type { Snippet } from 'svelte'
  import SyncDot from '../components/SyncDot.svelte'

  let { section, children }: { section: string; children: Snippet } = $props()

  const tabs = [
    { key: 'home', href: '/', label: 'Home' },
    { key: 'inventory', href: '/inventory', label: 'Inventory' },
    { key: 'brew', href: '/brew', label: 'Brew' },
    { key: 'settings', href: '/settings', label: 'Settings' },
  ]
  const title = $derived(tabs.find((t) => t.key === section)?.label ?? 'Coffee')
</script>

<div class="phone">
  <header>
    <h1>{title}</h1>
    <SyncDot />
  </header>
  <main>{@render children()}</main>
  <nav aria-label="Sections">
    {#each tabs as tab (tab.key)}
      <a href={tab.href} class:active={section === tab.key} aria-current={section === tab.key ? 'page' : undefined}
        >{tab.label}</a
      >
    {/each}
  </nav>
</div>

<style>
  .phone {
    min-height: 100dvh;
    padding: env(safe-area-inset-top) 0 calc(64px + env(safe-area-inset-bottom));
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
  }
  h1 {
    font-size: 28px;
  }
  main {
    padding: 0 16px 16px;
  }
  nav {
    position: fixed;
    inset: auto 0 0 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--surface);
    border-top: 1px solid var(--border);
  }
  nav a {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 56px;
    color: var(--text-muted);
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
  }
  nav a.active {
    color: var(--accent);
  }
</style>
