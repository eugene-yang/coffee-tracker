<script lang="ts">
  import { methodIconSvg } from '../lib/icons'

  let { method, size = 24 }: { method: string | null | undefined; size?: number } = $props()
</script>

<span class="icon">{@html methodIconSvg(method, size)}</span>

<style>
  .icon {
    display: inline-flex;
    flex: none;
  }
</style>
