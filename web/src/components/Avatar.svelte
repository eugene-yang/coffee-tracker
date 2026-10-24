<script lang="ts">
  import type { User } from '../lib/state/live.svelte'

  let { user, size = 40 }: { user: User | undefined; size?: number } = $props()

  const initial = $derived((user?.avatar || user?.name || '?').trim().slice(0, 1).toUpperCase())
</script>

<span
  class="avatar"
  style:width="{size}px"
  style:height="{size}px"
  style:font-size="{Math.round(size * 0.45)}px"
  style:background={user?.color ?? 'var(--surface-2)'}
  aria-hidden="true">{initial}</span
>

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: #121212;
    font-weight: 700;
    flex: none;
  }
</style>
