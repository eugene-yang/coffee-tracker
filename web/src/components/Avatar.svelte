<script lang="ts">
  import { avatarGlyph } from '../lib/domain/avatar'
  import type { User } from '../lib/state/live.svelte'

  let { user, size = 40 }: { user: User | undefined; size?: number } = $props()

  const a = $derived(avatarGlyph(user))
</script>

<span
  class="avatar"
  style:width="{size}px"
  style:height="{size}px"
  style:font-size="{Math.round(size * (a.emoji ? 0.58 : 0.45))}px"
  style:background={user?.color ?? 'var(--surface-2)'}
  aria-hidden="true">{a.glyph}</span
>

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: #121212;
    font-weight: 700;
    line-height: 1;
    flex: none;
  }
</style>
