<script lang="ts">
  import Avatar from '../components/Avatar.svelte'
  import { mutate, remove } from '../lib/db/local'
  import { uuidv7 } from '../lib/db/uuid'
  import {
    DEFAULT_TEMP_BANDS,
    TEMP_BANDS_SETTING,
    clampThresholds,
    type TempBandThresholds,
  } from '../lib/domain/tempBand'
  import { DEFAULT_DOSE_G, DEFAULT_REST_WINDOW, REST_WINDOW_SETTING, type RestWindow } from '../lib/domain/inventory'
  import { device, setDeviceUser, setLayoutChoice, type LayoutChoice } from '../lib/state/device.svelte'
  import { DOSE_SETTING } from '../lib/state/inventory.svelte'
  import { settingValue, users } from '../lib/state/live.svelte'
  import { syncNow, syncState } from '../lib/state/sync.svelte'
  import { href } from '../lib/state/router.svelte'

  const COLORS = ['#d39a6a', '#e6c36a', '#8fc2a0', '#86b3d9', '#b9a3e3', '#e39aa8']
  const LAYOUTS: { value: LayoutChoice; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'phone', label: 'Phone' },
    { value: 'station', label: 'Station' },
  ]

  let newName = $state('')
  let newColor = $state(COLORS[0])
  let editingId = $state<string | null>(null)
  let editName = $state('')

  const bands = $derived(settingValue<TempBandThresholds>(TEMP_BANDS_SETTING, DEFAULT_TEMP_BANDS))

  async function addUser(e: SubmitEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const id = uuidv7()
    const color = newColor
    // Reset the form before awaiting so anything typed meanwhile isn't wiped
    newName = ''
    newColor = COLORS[(COLORS.indexOf(color) + 1) % COLORS.length]
    if (!device.userId) setDeviceUser(id)
    await mutate('user', id, { name, color })
  }

  async function saveName(id: string) {
    const name = editName.trim()
    if (name) await mutate('user', id, { name })
    editingId = null
  }

  async function removeUser(id: string) {
    await remove('user', id)
    if (device.userId === id) setDeviceUser(null)
    editingId = null
  }

  const rest = $derived(settingValue<RestWindow>(REST_WINDOW_SETTING, DEFAULT_REST_WINDOW))
  const dose = $derived(settingValue<number>(DOSE_SETTING, DEFAULT_DOSE_G))

  function stepRest(key: keyof RestWindow, delta: number) {
    const next = { ...rest, [key]: Math.max(0, rest[key] + delta) }
    if (next.peak_days <= next.rest_days) next.peak_days = next.rest_days + 1
    mutate('setting', REST_WINDOW_SETTING, { value: next })
  }

  function stepBand(key: keyof TempBandThresholds, delta: number) {
    mutate('setting', TEMP_BANDS_SETTING, { value: clampThresholds({ ...bands, [key]: bands[key] + delta }) })
  }
</script>

<div class="stack settings">
  <section class="stack">
    <h2>This device</h2>
    <div class="card stack">
      <span class="muted">Who uses this device?</span>
      <div class="chips">
        {#each users.rows as user (user.id)}
          <button class="chip" class:selected={user.id === device.userId} onclick={() => setDeviceUser(user.id)}>
            <Avatar {user} size={28} />
            {user.name}
          </button>
        {:else}
          <span class="muted">Add a person below first.</span>
        {/each}
      </div>
      <span class="muted">Layout</span>
      <div class="segmented" role="radiogroup" aria-label="Layout">
        {#each LAYOUTS as l (l.value)}
          <button
            role="radio"
            aria-checked={device.layout === l.value}
            class:selected={device.layout === l.value}
            onclick={() => setLayoutChoice(l.value)}>{l.label}</button
          >
        {/each}
      </div>
    </div>
  </section>

  <section class="stack">
    <h2>Equipment</h2>
    <a class="card link" href={href('/settings/equipment')}>Brewers, grinders & recipes ›</a>
  </section>

  <section class="stack">
    <h2>People</h2>
    <div class="card stack">
      {#each users.rows as user (user.id)}
        {#if editingId === user.id}
          <form
            class="row"
            onsubmit={(e) => {
              e.preventDefault()
              saveName(user.id)
            }}
          >
            <input type="text" bind:value={editName} aria-label="Name" />
            <button class="primary" type="submit">Save</button>
            <button type="button" onclick={() => removeUser(user.id)}>Remove</button>
          </form>
          <div class="chips">
            {#each COLORS as c (c)}
              <button
                class="swatch"
                class:selected={user.color === c}
                style:background={c}
                aria-label="Color {c}"
                onclick={() => mutate('user', user.id, { color: c })}
              ></button>
            {/each}
          </div>
        {:else}
          <button
            class="person"
            onclick={() => {
              editingId = user.id
              editName = user.name ?? ''
            }}
          >
            <Avatar {user} size={36} />
            <span>{user.name}</span>
            {#if user.id === device.userId}<span class="muted">· this device</span>{/if}
          </button>
        {/if}
      {/each}

      <form class="stack" onsubmit={addUser}>
        <div class="row">
          <input type="text" placeholder="Add a person" bind:value={newName} aria-label="New person's name" />
          <button class="primary" type="submit" disabled={!newName.trim()}>Add</button>
        </div>
        <div class="chips">
          {#each COLORS as c (c)}
            <button
              type="button"
              class="swatch"
              class:selected={newColor === c}
              style:background={c}
              aria-label="Color {c}"
              onclick={() => (newColor = c)}
            ></button>
          {/each}
        </div>
      </form>
    </div>
  </section>

  <section class="stack">
    <h2>Cup temperature</h2>
    <div class="card stack">
      <span class="muted">Suggested from minutes since brewing; you can always change it when rating.</span>
      {#each [{ key: 'hot_max_min', label: 'Hot under' }, { key: 'warm_max_min', label: 'Warm under' }] as b (b.key)}
        {@const key = b.key as keyof TempBandThresholds}
        <div class="row stepper">
          <span class="label">{b.label}</span>
          <button aria-label="{b.label} minus one" onclick={() => stepBand(key, -1)}>−</button>
          <span class="value">{bands[key]} min</span>
          <button aria-label="{b.label} plus one" onclick={() => stepBand(key, 1)}>+</button>
        </div>
      {/each}
      <span class="muted">Cool after {bands.warm_max_min} min.</span>
    </div>
  </section>

  <section class="stack">
    <h2>Beans</h2>
    <div class="card stack">
      <span class="muted">Days off roast for the freshness bar (freezer time doesn't count).</span>
      {#each [{ key: 'rest_days', label: 'Resting until day' }, { key: 'peak_days', label: 'Peak until day' }] as r (r.key)}
        {@const key = r.key as keyof RestWindow}
        <div class="row stepper">
          <span class="label">{r.label}</span>
          <button aria-label="{r.label} minus one" onclick={() => stepRest(key, -1)}>−</button>
          <span class="value">{rest[key]}</span>
          <button aria-label="{r.label} plus one" onclick={() => stepRest(key, 1)}>+</button>
        </div>
      {/each}
      <div class="row stepper">
        <span class="label">Usual dose (for “cups left”)</span>
        <button aria-label="Dose minus one" onclick={() => mutate('setting', DOSE_SETTING, { value: Math.max(1, dose - 1) })}>−</button>
        <span class="value">{dose} g</span>
        <button aria-label="Dose plus one" onclick={() => mutate('setting', DOSE_SETTING, { value: dose + 1 })}>+</button>
      </div>
    </div>
  </section>

  <section class="stack">
    <h2>Sync</h2>
    <div class="card stack">
      <span
        >{syncState.status === 'preview'
          ? 'Preview build — no server; everything stays on this device'
          : syncState.status === 'offline'
          ? 'Server unreachable — changes are saved on this device'
          : syncState.status === 'syncing'
            ? 'Syncing…'
            : syncState.pending > 0
              ? `${syncState.pending} change(s) waiting`
              : 'Up to date'}</span
      >
      {#if syncState.lastSyncAt}
        <span class="muted">Last synced {new Date(syncState.lastSyncAt).toLocaleString()}</span>
      {/if}
      <button onclick={() => syncNow()}>Sync now</button>
    </div>
  </section>
</div>

<style>
  .settings {
    max-width: 640px;
  }
  .link {
    display: block;
    color: var(--text);
    text-decoration: none;
    font-weight: 600;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px 0 8px;
  }
  .chip.selected,
  .segmented .selected {
    border-color: var(--accent);
    color: var(--accent);
  }
  .segmented {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .swatch {
    width: var(--tap);
    height: var(--tap);
    min-height: 0;
    padding: 0;
    border-radius: 50%;
    border: 3px solid transparent;
  }
  .swatch.selected {
    border-color: var(--text);
  }
  .person {
    display: flex;
    align-items: center;
    gap: 12px;
    border: none;
    background: transparent;
    padding: 0;
    text-align: left;
  }
  form.row input {
    flex: 1;
  }
  .stepper .label {
    flex: 1;
  }
  .stepper button {
    width: var(--tap);
    padding: 0;
    font-size: 22px;
  }
  .stepper .value {
    min-width: 72px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
</style>
