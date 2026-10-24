<script lang="ts">
  // A 1–5 scale with words only at 1, 3 and 5; tapping the selected step clears it
  import { stepName, type ScaleDef } from '../lib/domain/tasting'

  let { def, value, disabled = false, onchange }: { def: ScaleDef; value: number | null | undefined; disabled?: boolean; onchange: (v: number | null) => void } = $props()
</script>

<div class="scale">
  <span class="label">{def.label}</span>
  <div class="steps" role="radiogroup" aria-label={def.label}>
    {#each [1, 2, 3, 4, 5] as n (n)}
      <button
        role="radio"
        aria-checked={value === n}
        aria-label={stepName(def, n)}
        class:on={value === n}
        {disabled}
        onclick={() => onchange(value === n ? null : n)}><span class="dot"></span></button
      >
    {/each}
  </div>
  <div class="words" aria-hidden="true">
    <span>{def.words[0]}</span><span></span><span>{def.words[1]}</span><span></span><span>{def.words[2]}</span>
  </div>
</div>

<style>
  .scale {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .label {
    font-weight: 600;
  }
  .steps,
  .words {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }
  .steps button {
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--border);
  }
  .steps button.on {
    border-color: var(--accent);
  }
  .steps button.on .dot {
    background: var(--accent);
    width: 18px;
    height: 18px;
  }
  .words {
    font-size: 13px;
    color: var(--text-muted);
    text-align: center;
  }
</style>
