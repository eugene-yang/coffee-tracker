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
  import { device, setDeviceUser, setLayoutChoice, type LayoutChoice } from '../lib/state/device.svelte'
  import { settingValue, users } from '../lib/state/live.svelte'
  import { syncNow, syncState } from '../lib/state/sync.svelte'

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
    await mutate('user', id, { name, color: newColor })
    if (!device.userId) setDeviceUser(id)
    newName = ''
    newColor = COLORS[(COLORS.indexOf(newColor) + 1) % COLORS.length]
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
    <h2>Sync</h2>
    <div class="card stack">
      <span
        >{syncState.status === 'offline'
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
