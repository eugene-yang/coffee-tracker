<script lang="ts">
  // Big −/+ stepper: the only way to change numbers during a brew (no typing on the station)
  let {
    label,
    value,
    step = 1,
    min = 0,
    max = 9999,
    unit = '',
    onchange,
  }: {
    label: string
    value: number | null
    step?: number
    min?: number
    max?: number
    unit?: string
    onchange: (v: number | null) => void
  } = $props()

  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
  function bump(dir: number) {
    const next = Math.round(((value ?? 0) + dir * step) * 10) / 10
    onchange(Math.min(max, Math.max(min, next)))
  }
</script>

<div class="stepper">
  <span class="label">{label}</span>
  <button aria-label="{label} minus" onclick={() => bump(-1)}>−</button>
  <span class="value">{value == null ? '—' : `${fmt(value)}${unit ? ` ${unit}` : ''}`}</span>
  <button aria-label="{label} plus" onclick={() => bump(1)}>+</button>
</div>

<style>
  .stepper {
    display: grid;
    grid-template-columns: 1fr var(--tap) 96px var(--tap);
    align-items: center;
    gap: 8px;
  }
  .label {
    color: var(--text-muted);
  }
  button {
    padding: 0;
    font-size: 24px;
  }
  .value {
    text-align: center;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
</style>
