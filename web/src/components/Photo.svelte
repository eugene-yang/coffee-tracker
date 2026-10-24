<script lang="ts">
  import { getPhotoBlob } from '../lib/db/local'
  import { photoUrl } from '../lib/photo'

  let { id, size = 'thumb', alt = '' }: { id: string | undefined; size?: 'thumb' | 'full'; alt?: string } = $props()

  // Photos not uploaded yet live in IndexedDB; uploaded ones come from the server (thumbs cached by the SW)
  let src = $state<string | null>(null)

  $effect(() => {
    if (!id) {
      src = null
      return
    }
    let objectUrl: string | null = null
    let cancelled = false
    getPhotoBlob(id).then((blob) => {
      if (cancelled) return
      if (blob) src = objectUrl = URL.createObjectURL(blob)
      else src = photoUrl(id, size)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  })
</script>

{#if src}
  <img {src} {alt} loading="lazy" decoding="async" />
{:else}
  <span class="placeholder" aria-hidden="true"></span>
{/if}

<style>
  img,
  .placeholder {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: var(--surface-2);
  }
</style>
