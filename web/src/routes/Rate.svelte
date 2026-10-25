<script lang="ts">
  // More detail for one tasting: profile → quality → compass → flavors → other notes. Every tap saves.
  // /rate/:brewId/:userId[/:tastingId] — without a tasting id, the first star starts a new tasting.
  import { onDestroy } from 'svelte'
  import Avatar from '../components/Avatar.svelte'
  import Scale from '../components/Scale.svelte'
  import Stars from '../components/Stars.svelte'
  import TempChip from '../components/TempChip.svelte'
  import { brewerLabel } from '../lib/domain/brew'
  import { FLAVOR_FAMILIES, flavorTag } from '../lib/domain/flavors'
  import { COMPASS, PROFILE, QUALITY, compassHint, cycleBand, minutesSince } from '../lib/domain/tasting'
  import { suggestTempBand, type TempBand } from '../lib/domain/tempBand'
  import type { Tasting } from '../lib/domain/types'
  import { currentLayout, device } from '../lib/state/device.svelte'
  import { inventory } from '../lib/state/inventory.svelte'
  import { brewers, brews, tastings, users } from '../lib/state/live.svelte'
  import { navigate, replace, route } from '../lib/state/router.svelte'
  import { timeAgo } from '../lib/state/shortcuts.svelte'
  import { rateOverall, tastingState, toggleTastingTag, updateTasting } from '../lib/state/tastings.svelte'

  const parts = $derived(route.path.split('/'))
  const brewId = $derived(parts[2] ?? '')
  const userId = $derived(parts[3] || device.userId || '')
  const tasting = $derived(tastings.get(parts[4]))

  const layout = $derived(currentLayout())
  const brew = $derived(brews.get(brewId))
  const view = $derived(brew ? inventory.byId.get(brew.bag_id) : undefined)
  const user = $derived(users.get(userId))
  const roasterTags = $derived(view?.flavorTags ?? [])

  const minutes = $derived(brew ? minutesSince(brew.brewed_at, tastingState.now) : 0)
  const suggested = $derived(suggestTempBand(minutes, tastingState.thresholds))
  let override = $state<TempBand | null>(null)
  const band = $derived(tasting?.temp_band ?? override ?? suggested)

  async function rate(n: number) {
    if (tasting) return updateTasting(tasting.id, { overall: n })
    if (!brew || !userId) return
    const { id } = await rateOverall(brew, userId, n, band, suggested, undefined)
    replace(`/rate/${brewId}/${userId}/${id}`)
  }

  function cycle() {
    const next = cycleBand(band)
    if (tasting) updateTasting(tasting.id, { temp_band: next })
    else override = next
  }

  const set = (patch: Partial<Tasting>) => tasting && updateTasting(tasting.id, patch)
  const hasTag = (t: string) => !!tasting?.tags?.some((x) => x.tag === t)
  const toggle = (t: string) => tasting && toggleTastingTag(tasting.id, t, $state.snapshot(roasterTags))

  let family = $state<string | null>(null)
  const openFamily = $derived(FLAVOR_FAMILIES.find((f) => f.id === family))
  const familyCount = (id: string) => (tasting?.tags ?? []).filter((t) => FLAVOR_FAMILIES.find((f) => f.id === id)?.tags.some((x) => x.id === t.tag)).length

  // Note: typed on the phone only (the station is taps only); saved shortly after typing stops
  let note = $state('')
  let noteFor: string | null = null
  let noteTimer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    if (tasting && tasting.id !== noteFor) {
      noteFor = tasting.id
      note = tasting.note ?? ''
    }
  })
  function saveNote() {
    clearTimeout(noteTimer)
    const id = noteFor
    const t = id ? tastings.get(id) : undefined
    if (id && t && (t.note ?? '') !== note) updateTasting(id, { note: note.trim() ? note : null })
  }
  onDestroy(saveNote)

  const hint = $derived(tasting ? compassHint(tasting.compass_sour_bitter, tasting.compass_weak_strong) : null)

  function back() {
    saveNote()
    if (history.length > 1) history.back()
    else navigate('/')
  }
</script>

{#if !brew}
  <p class="muted">{brews.loaded ? 'This brew doesn’t exist (anymore).' : 'Loading…'}</p>
{:else}
  <div class="rate {layout}">
    <button class="back" onclick={back}>‹ Back</button>

    <header>
      <Avatar {user} size={layout === 'station' ? 56 : 40} />
      <span class="titles">
        <strong>{view?.title ?? 'Bag'}</strong>
        <span class="muted">{user?.name ?? '?'} · {brewerLabel(brew, brewers.rows)} · brewed {timeAgo(brew.brewed_at, tastingState.now)}</span>
      </span>
    </header>

    <section class="overall">
      <div class="row">
        <Stars value={tasting?.overall} label="Overall" onrate={rate} />
        <TempChip {band} {minutes} oncycle={cycle} />
      </div>
      {#if !tasting}<p class="muted">Start with the stars — everything below saves as you go.</p>{/if}
    </section>

    <fieldset disabled={!tasting}>
      <section class="card stack">
        <h2>Profile</h2>
        <p class="help">How much of each — not how good.</p>
        {#each PROFILE as def (def.field)}
          <Scale {def} value={tasting?.[def.field]} disabled={!tasting} onchange={(v) => set({ [def.field]: v })} />
        {/each}
      </section>

      <section class="card stack quality">
        <h2>Quality</h2>
        {#each QUALITY as def (def.field)}
          <Scale {def} value={tasting?.[def.field]} disabled={!tasting} onchange={(v) => set({ [def.field]: v })} />
        {/each}
      </section>

      <section class="card stack">
        <h2>Compass</h2>
        {#each COMPASS as def (def.field)}
          <Scale {def} value={tasting?.[def.field]} disabled={!tasting} onchange={(v) => set({ [def.field]: v })} />
        {/each}
        <p class="help">“Sour” is a judgment — sharp and unpleasant, often under-extracted. It isn’t the same as high acidity, which can be bright and lovely.</p>
        {#if hint}<p class="hint">{hint}</p>{/if}
      </section>

      <section class="card stack">
        <h2>Flavors</h2>
        {#if roasterTags.length}
          <span class="muted">Roaster says — tap what you taste:</span>
          <div class="chips" role="group" aria-label="Roaster says">
            {#each roasterTags as t (t)}
              <button class="chip" class:on={hasTag(t)} aria-pressed={hasTag(t)} onclick={() => toggle(t)}>{flavorTag(t)?.label ?? t}</button>
            {/each}
          </div>
        {:else if view?.coffee?.tasting_notes?.length}
          <span class="muted">Roaster’s notes: {view.coffee.tasting_notes.join(', ')}</span>
        {/if}
        <div class="chips" role="group" aria-label="Flavor families">
          {#each FLAVOR_FAMILIES as f (f.id)}
            {@const n = familyCount(f.id)}
            <button class="chip" class:open={family === f.id} aria-expanded={family === f.id} onclick={() => (family = family === f.id ? null : f.id)}
              >{f.label}{n ? ` · ${n}` : ''}</button
            >
          {/each}
        </div>
        {#if openFamily}
          <div class="chips wrap" role="group" aria-label={openFamily.label}>
            {#each openFamily.tags as t (t.id)}
              <button class="chip" class:on={hasTag(t.id)} aria-pressed={hasTag(t.id)} onclick={() => toggle(t.id)}>{t.label}</button>
            {/each}
          </div>
        {/if}
      </section>

      <section class="card stack">
        <h2>Other notes</h2>
        {#if layout === 'phone'}
          <textarea rows="3" placeholder="Anything worth remembering" aria-label="Note" bind:value={note} oninput={() => {
            clearTimeout(noteTimer)
            noteTimer = setTimeout(saveNote, 700)
          }} onblur={saveNote}></textarea>
        {:else}
          <p class="muted">{tasting?.note || 'Add a note from your phone.'}</p>
        {/if}
      </section>
    </fieldset>

    <button class="primary done" onclick={back}>Done</button>
  </div>
{/if}

<style>
  .rate {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 640px;
    margin: 0 auto;
    padding-bottom: 24px;
  }
  .back {
    align-self: flex-start;
    border: none;
    background: transparent;
    color: var(--accent);
    padding: 0;
    min-height: 40px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .titles {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .titles .muted {
    font-size: 14px;
  }
  .overall .row {
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .overall p {
    margin: 4px 0 0;
  }
  fieldset {
    border: none;
    margin: 0;
    padding: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  fieldset:disabled {
    opacity: 0.5;
  }
  .quality {
    background: var(--surface-2);
  }
  .help {
    margin: 0;
    font-size: 14px;
    color: var(--text-muted);
  }
  .hint {
    margin: 0;
    font-weight: 600;
  }
  .chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .chips.wrap {
    flex-wrap: wrap;
  }
  .chip {
    flex: none;
    white-space: nowrap;
  }
  .station .chip {
    min-height: 56px;
  }
  .chip.on,
  .chip.open {
    border-color: var(--accent);
    color: var(--accent);
  }
  textarea {
    font: inherit;
    color: inherit;
    width: 100%;
    padding: 10px 12px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--surface);
    resize: vertical;
  }
  .done {
    min-height: 56px;
    font-weight: 700;
  }
  .station .done {
    min-height: 72px;
  }
</style>
