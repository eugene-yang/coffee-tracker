<script lang="ts">
  // A person's avatar emoji: tap one from the grid (station and phone), or type any with the phone's
  // emoji keyboard. "None" goes back to their initial.
  import { AVATAR_EMOJI, firstGrapheme } from '../lib/domain/avatar'

  let { value, typing = false, onpick }: { value: string | null; typing?: boolean; onpick: (emoji: string | null) => void } = $props()

  const own = $derived(value && !(AVATAR_EMOJI as readonly string[]).includes(value) ? value : '')
</script>

<div class="picker" role="radiogroup" aria-label="Avatar emoji">
  <button type="button" class="opt none" role="radio" aria-checked={!value} class:on={!value} onclick={() => onpick(null)}>None</button>
  {#each AVATAR_EMOJI as e (e)}
    <button type="button" class="opt" role="radio" aria-checked={value === e} aria-label={e} class:on={value === e} onclick={() => onpick(e)}>{e}</button>
  {/each}
</div>
{#if typing}
  <input
    type="text"
    class="own"
    class:on={!!own}
    placeholder="Or type your own emoji"
    aria-label="Your own emoji"
    value={own}
    oninput={(e) => {
      const g = firstGrapheme(e.currentTarget.value)
      if (g) onpick(g)
    }}
  />
{/if}

<style>
  .picker {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: 6px;
  }
  .opt {
    min-height: 44px;
    padding: 0;
    font-size: 24px;
    line-height: 1;
    border: 2px solid transparent;
    background: var(--surface-2);
  }
  .opt.none {
    grid-column: span 2;
    font-size: 14px;
    font-weight: 600;
  }
  .opt.on {
    border-color: var(--accent);
    background: var(--surface);
  }
  .own.on {
    border-color: var(--accent);
  }
</style>
