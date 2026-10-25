<script lang="ts">
  import type { Snippet } from 'svelte'
  import SyncDot from '../components/SyncDot.svelte'
  import { href } from '../lib/state/router.svelte'

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
  <main data-scroll>{@render children()}</main>
  <nav aria-label="Sections">
    {#each tabs as tab (tab.key)}
      <a href={href(tab.href)} class:active={section === tab.key} aria-current={section === tab.key ? 'page' : undefined}
        >{tab.label}</a
      >
    {/each}
  </nav>
</div>

<style>
  /* One fixed frame; only <main> scrolls. When the whole page scrolled, iOS dragged the bottom bars
     along on short pages (rubber-band / collapsing toolbar) */
  .phone {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    padding-top: env(safe-area-inset-top);
  }
  header {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
  }
  h1 {
    font-size: 28px;
  }
  main {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 16px 16px;
  }
  nav {
    flex: none;
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
